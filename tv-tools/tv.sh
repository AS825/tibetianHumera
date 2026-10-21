#!/usr/bin/env bash
# Control and clean up a Philips Android TV over ADB from this computer.
# Every change is recorded in state/undo.sh and can be reverted with `./tv.sh undo`.
# Run `./tv.sh help` for the list of commands.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STATE="$HERE/state"
LOGS="$HERE/logs"
LOG="$LOGS/monitor.log"
UNDO="$STATE/undo.sh"
mkdir -p "$STATE" "$LOGS"

ADB="$HERE/platform-tools/adb"
[ -x "$ADB" ] || ADB="$(command -v adb || true)"
TV="${TV:-$(cat "$STATE/tv.conf" 2>/dev/null || true)}"

YT_PKG="com.google.android.youtube.tv"

# Never disabled, whatever the proposal file says: launchers, Play Services/Store,
# keyboards and input methods, TV inputs/tuners/live TV/providers, settings, setup,
# system UI, WebView, Bluetooth/remote, voice/assistant, accessibility, YouTube.
PROTECTED_RE='launcher|\.gms|gsf|vending|inputmethod|\.ime|keyboard|latin|tv\.input|tvinput|provider|tuner|livetv|live_tv|dtv|channel|epg|hdmi|cec|systemui|settings|setup|packageinstaller|permissioncontroller|webview|bluetooth|remote|katniss|assistant|tts|accessibility|youtube|^android$|com\.android\.(shell|phone|server)'
# Names that usually mean ads, recommendations, feedback, demos or preloaded promos.
# A match only puts the package on the review list; nothing is disabled automatically.
CANDIDATE_RE='(^|[._])ads?([._]|$)|advert|promo|demo|retail|shop|feedback|survey|recommend|sponsor|partner|rakuten|wuaki|tpvision|tpv|philips'

TUNE_KEYS="window_animation_scale transition_animation_scale animator_duration_scale private_dns_mode private_dns_specifier"
DNS_HOST="dns.adguard-dns.com"

die() { echo "error: $*" >&2; exit 1; }
say() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }

need_adb() { [ -n "$ADB" ] && [ -x "$ADB" ] || die "adb not found. Run: ./tv.sh install-adb"; }
need_tv() {
  need_adb
  [ -n "$TV" ] || die "no TV set. Run: ./tv.sh connect <TV-IP>"
  local st; st="$("$ADB" -s "$TV" get-state 2>&1 || true)"
  case "$st" in
    device) ;;
    *unauthorized*) die "TV says 'unauthorized': accept the 'Allow USB debugging?' prompt on the TV (tick 'Always allow'), then retry." ;;
    *) die "TV $TV not connected ($st). Run: ./tv.sh connect ${TV%%:*}" ;;
  esac
}

# Quote one argument for the TV's shell.
shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# Run an adb command against the TV. The command is logged with a timestamp to
# logs/monitor.log, and the TV's logcat (warnings + activity/package events) is
# streamed into the same log only while the command runs. Watch with: ./tv.sh monitor
tvrun() {
  local devtime lp="" rc=0
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] \$ adb $*" >> "$LOG"
  devtime="$("$ADB" -s "$TV" shell date "+%m-%d\\ %H:%M:%S.000" 2>/dev/null | tr -d '\r' || true)"
  if [ -n "$devtime" ]; then
    "$ADB" -s "$TV" logcat -v time -T "$devtime" '*:W' ActivityTaskManager:I ActivityManager:I PackageManager:I \
      </dev/null >> "$LOG" 2>/dev/null &
    lp=$!
  fi
  "$ADB" -s "$TV" "$@" </dev/null || rc=$?
  sleep 0.8
  if [ -n "$lp" ]; then kill "$lp" 2>/dev/null || true; wait "$lp" 2>/dev/null || true; fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] exit $rc" >> "$LOG"
  return $rc
}
tvsh() { tvrun shell "$@" | tr -d '\r'; }
key() { say "key $1"; tvsh input keyevent "$1" >/dev/null; sleep "${2:-1}"; }

# ---------------------------------------------------------------- setup

cmd_install_adb() {
  if [ -n "$ADB" ] && [ -x "$ADB" ]; then echo "adb already present: $ADB ($("$ADB" version | head -1))"; return; fi
  local os
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) die "On Windows download https://dl.google.com/android/repository/platform-tools-latest-windows.zip and unzip it here." ;;
  esac
  mkdir -p "$HERE/downloads"
  local zip="$HERE/downloads/platform-tools-latest-$os.zip"
  say "Downloading Android platform-tools from Google (dl.google.com)"
  curl -fL --proto '=https' -o "$zip" "https://dl.google.com/android/repository/platform-tools-latest-$os.zip"
  unzip -q -o "$zip" -d "$HERE"
  "$HERE/platform-tools/adb" version | head -2
}

cmd_connect() {
  need_adb
  local target="${1:?usage: ./tv.sh connect <TV-IP>[:port]}"
  case "$target" in *:*) ;; *) target="$target:5555" ;; esac
  say "adb connect $target  (look at the TV: accept 'Allow debugging?' and tick 'Always allow')"
  local out; out="$("$ADB" connect "$target" 2>&1 || true)"; echo "$out"
  case "$out" in
    *"No route to host"*)
      die "No route to host. On macOS: System Settings → Privacy & Security → Local Network → enable your terminal app, restart the terminal, retry. Also check the computer and TV are on the same network." ;;
    *refused*|*failed*|*"cannot connect"*)
      die "Connection refused. Use Wireless debugging pairing: on the TV open Developer options → Wireless debugging → 'Pair device with pairing code', then run: ./tv.sh pair <IP:PAIR-PORT> <CODE> and ./tv.sh connect <IP:PORT shown under Wireless debugging>" ;;
  esac
  local i st
  for i in $(seq 1 30); do
    st="$("$ADB" -s "$target" get-state 2>&1 || true)"
    [ "$st" = device ] && break
    sleep 2
  done
  [ "$st" = device ] || die "not authorized yet ($st). Accept the prompt on the TV and run connect again."
  echo "$target" > "$STATE/tv.conf"; TV="$target"
  say "Connected."; cmd_status
}

cmd_pair() {
  need_adb
  "$ADB" pair "${1:?usage: ./tv.sh pair <IP:PAIR-PORT> <CODE>}" "${2:?pairing code}"
}

cmd_status() {
  need_tv
  echo "TV:        $TV"
  echo "Model:     $(tvsh getprop ro.product.manufacturer) $(tvsh getprop ro.product.model) ($(tvsh getprop ro.product.device))"
  echo "Android:   $(tvsh getprop ro.build.version.release)  build $(tvsh getprop ro.build.display.id)"
  echo "CPU ABI:   $(tvsh getprop ro.product.cpu.abi)"
  echo "On screen: $(tvsh dumpsys window | grep -m1 mCurrentFocus | sed 's/^ *//')"
  echo "Settings:"; for k in $TUNE_KEYS; do printf '  %-28s %s\n' "$k" "$(tvsh settings get global "$k")"; done
}

# ---------------------------------------------------------------- backup + scan

cmd_backup() {
  need_tv
  local d="$STATE/backup-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$d"
  say "Saving package lists and settings to $d"
  tvsh pm list packages -f -u   > "$d/packages-all.txt"
  tvsh pm list packages -d      > "$d/packages-disabled.txt"
  tvsh pm list packages -3      > "$d/packages-thirdparty.txt"
  tvsh pm list packages -s      > "$d/packages-system.txt"
  for ns in global secure system; do tvsh settings list "$ns" > "$d/settings-$ns.txt"; done
  for k in $TUNE_KEYS; do echo "$k=$(tvsh settings get global "$k")"; done > "$d/touched-settings.txt"
  wc -l "$d"/packages-*.txt

  if [ -f "$UNDO" ]; then
    echo "Undo file already exists ($UNDO); keeping the original state recorded there."
    return
  fi
  {
    echo "# Undo commands for $TV, created $(date). Run with: ./tv.sh undo"
    echo "# Original settings (from $d/touched-settings.txt):"
    while IFS='=' read -r k v; do
      if [ "$v" = null ] || [ -z "$v" ]; then echo "tvsh settings delete global $k"
      else echo "tvsh settings put global $k $(shq "$v")"; fi
    done < "$d/touched-settings.txt"
    echo "# Packages disabled / apps installed by tv.sh (added as they happen):"
  } > "$UNDO"
  say "Undo file written: $UNDO"; cat "$UNDO"
}

cmd_scan() {
  need_tv
  local out="$STATE/scan.txt" disabled system
  disabled="$(tvsh pm list packages -d | sed 's/^package://')"
  system="$(tvsh pm list packages -s | sed 's/^package://')"
  say "Listing every package (nothing is changed)"
  tvsh pm list packages -f -u | sed 's/^package://' | while IFS= read -r line; do
    local pkg="${line##*=}" path="${line%=*}" st=on ty=user fl=-
    grep -qx "$pkg" <<<"$disabled" && st=OFF
    grep -qx "$pkg" <<<"$system" && ty=system
    if   grep -Eiq "$PROTECTED_RE" <<<"$pkg"; then fl=protected
    elif grep -Eiq "$CANDIDATE_RE" <<<"$pkg$path"; then fl=REVIEW
    fi
    printf '%-4s %-7s %-10s %-55s %s\n' "$st" "$ty" "$fl" "$pkg" "$path"
  done | sort -k4 > "$out"
  echo "Full list: $out ($(wc -l < "$out") packages)"
  echo; echo "Packages to review (candidates for disabling):"
  grep ' REVIEW ' "$out" || echo "  (none matched the name filter; review the third-party list in $out)"
  echo; echo "Third-party (user-installed or preloaded as updatable) apps:"
  grep ' user ' "$out" || true
}

# ---------------------------------------------------------------- changes

confirm() { local a; read -r -p "$1 Type YES to continue: " a; [ "$a" = YES ] || die "cancelled"; }
need_undo() { [ -f "$UNDO" ] || die "run ./tv.sh backup first (it creates the undo file)"; }

cmd_disable() {
  need_tv; need_undo
  local file="${1:-$HERE/cleanup-proposal.txt}" pkgs
  pkgs="$(sed 's/#.*//' "$file" | tr -s ' \t' '\n' | grep -v '^$' || true)"
  [ -n "$pkgs" ] || die "no packages listed in $file"
  echo "Will DISABLE (not uninstall) for user 0:"; sed 's/^/  /' <<<"$pkgs"
  confirm "Disable these packages?"
  local disabled; disabled="$(tvsh pm list packages -d | sed 's/^package://')"
  local p out
  for p in $pkgs; do
    if grep -Eiq "$PROTECTED_RE" <<<"$p"; then echo "SKIP $p (protected)"; continue; fi
    if [ -z "$(tvsh pm path "$p")" ]; then echo "SKIP $p (not installed)"; continue; fi
    if grep -qx "$p" <<<"$disabled"; then echo "SKIP $p (already disabled before)"; continue; fi
    out="$(tvsh pm disable-user --user 0 "$p" 2>&1 || true)"
    if grep -q 'disabled-user' <<<"$out"; then
      echo "tvsh pm enable --user 0 $p" >> "$UNDO"; echo "OK   $p"
    else
      echo "FAIL $p: $out"
    fi
  done
}

cmd_tune() {
  need_tv; need_undo
  echo "Will set: animation scales 0.5 (window, transition, animator) and Private DNS = $DNS_HOST"
  confirm "Apply these settings?"
  local k
  for k in window_animation_scale transition_animation_scale animator_duration_scale; do
    tvsh settings put global "$k" 0.5
  done
  tvsh settings put global private_dns_mode hostname
  tvsh settings put global private_dns_specifier "$DNS_HOST"
  sleep 3
  for k in $TUNE_KEYS; do printf '  %-28s %s\n' "$k" "$(tvsh settings get global "$k")"; done
  say "Private DNS status:"
  tvsh dumpsys connectivity | grep -iE 'PrivateDns|private dns' | head -5 || true
  if tvsh ping -c 1 -W 3 www.youtube.com >/dev/null 2>&1; then echo "  name resolution OK"
  else echo "  WARNING: www.youtube.com did not answer; if the TV has no internet now, run ./tv.sh undo"; fi
}

# Install the newest APK from a project's official GitHub releases page.
cmd_install_gh() {
  need_tv
  local repo="${1:?usage: ./tv.sh install-gh <owner/repo> [asset-filter]}" filter="${2:-}"
  [[ "$repo" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || die "repo must look like owner/name"
  say "Looking up the latest release of github.com/$repo"
  local urls; urls="$(curl -fsSL --proto '=https' "https://api.github.com/repos/$repo/releases/latest" \
    | grep -o '"browser_download_url": *"[^"]*\.apk"' | sed 's/.*"\(https[^"]*\)"/\1/' \
    | grep "^https://github.com/$repo/releases/download/" || true)"
  [ -n "$urls" ] || die "no .apk in the latest release of $repo"
  [ -n "$filter" ] && urls="$(grep -i -- "$filter" <<<"$urls" || true)"
  if [ "$(wc -l <<<"$urls")" -gt 1 ]; then
    local abi pick=""; abi="$(tvsh getprop ro.product.cpu.abi)"
    case "$abi" in
      arm64*) pick="$(grep -iE 'arm64|aarch64' <<<"$urls" || true)" ;;
      armeabi*) pick="$(grep -iE 'armeabi|armv7|arm32' <<<"$urls" || true)" ;;
    esac
    [ -n "$pick" ] || pick="$(grep -iE 'universal|generic' <<<"$urls" || true)"
    [ "$(wc -l <<<"$pick")" -eq 1 ] && [ -n "$pick" ] || {
      echo "Several APKs, TV ABI is $abi:"; sed 's/^/  /' <<<"$urls"
      die "re-run with a filter, e.g. ./tv.sh install-gh $repo <part-of-file-name>"; }
    urls="$pick"
  fi
  [ -n "$urls" ] || die "filter matched nothing"
  mkdir -p "$HERE/downloads"
  local apk="$HERE/downloads/$(basename "$urls")"
  say "Downloading $urls"
  curl -fL --proto '=https' -o "$apk" "$urls"
  echo "SHA-256: $(shasum -a 256 "$apk" 2>/dev/null || sha256sum "$apk")"
  local before after new
  before="$(tvsh pm list packages -3 | sort)"
  say "Installing on the TV"
  tvrun install -r "$apk"
  after="$(tvsh pm list packages -3 | sort)"
  new="$(comm -13 <(echo "$before") <(echo "$after") | sed 's/^package://')"
  if [ -n "$new" ]; then
    [ -f "$UNDO" ] && for p in $new; do echo "tvsh pm uninstall $p   # installed from github.com/$repo" >> "$UNDO"; done
    echo "Installed: $new"
  else
    echo "Updated an app that was already installed (undo file unchanged)."
  fi
}

cmd_undo() {
  need_tv; need_undo
  echo "These commands will run (newest first):"
  grep -v '^#' "$UNDO" | awk '{a[NR]=$0} END{for(i=NR;i>0;i--)print a[i]}' | sed 's/^/  /'
  confirm "Revert everything?"
  grep -v '^#' "$UNDO" | awk '{a[NR]=$0} END{for(i=NR;i>0;i--)print a[i]}' | while IFS= read -r line; do
    [ -n "$line" ] || continue
    echo "+ $line"; eval "$line" || echo "  (failed, continuing)"
  done
  mv "$UNDO" "$UNDO.done-$(date +%Y%m%d-%H%M%S)"
  say "Reverted. A fresh './tv.sh backup' starts a new undo file."
}

# ---------------------------------------------------------------- YouTube

# Look at the screen before pressing OK: save a screenshot, dump the UI tree and
# stop if it shows sign-in, password, account or purchase screens.
check_screen() {
  local tag="$1" shot="$LOGS/$(date +%H%M%S)-$1.png" ui
  tvrun exec-out screencap -p > "$shot" 2>/dev/null || true
  ui="$(tvrun exec-out "uiautomator dump /sdcard/tvsh-ui.xml >/dev/null 2>&1 && cat /sdcard/tvsh-ui.xml" 2>/dev/null || true)"
  echo "  screen: $(tvsh dumpsys window | grep -m1 mCurrentFocus | sed 's/^ *//')  shot: $shot"
  if grep -Eiq 'Sign in|Anmelden|Password|Passwort|Add account|Konto hinzuf|Buy |Kaufen|Rent |Leihen|Purchase' <<<"$ui"; then
    die "the TV shows a sign-in/account/purchase screen; stopping without pressing OK (see $shot)"
  fi
  if grep -Eiq "Who.s watching|Wer schaut|Wer sieht|Choose an account|Konto auswählen" <<<"$ui"; then echo "profile"; fi
  if [ "${ASK:-0}" = 1 ]; then local a; read -r -p "  [$tag] press OK on the TV? [Y/n] " a; [ "${a:-Y}" != n ] || die "stopped"; fi
}

yt_playing() { tvsh dumpsys media_session | awk -v p="$YT_PKG" '$0~p{f=1} f&&/state=PlaybackState/{print; exit}' | grep -q 'state=3'; }

cmd_youtube() {
  need_tv
  local what="${1:?usage: ./tv.sh youtube \"search words\" | <YouTube URL>}" comp r
  [ -n "$(tvsh pm path "$YT_PKG")" ] || die "YouTube for Android TV is not installed or is disabled"
  comp="$(tvsh cmd package resolve-activity --brief -c android.intent.category.LEANBACK_LAUNCHER "$YT_PKG" | tail -1)"
  [[ "$comp" == */* ]] || comp="$YT_PKG/com.google.android.apps.youtube.tv.activity.ShellActivity"

  say "1/5 Wake the TV and go Home"
  key KEYCODE_WAKEUP 1; key KEYCODE_HOME 2
  say "2/5 Open YouTube"
  tvsh am start -n "$comp" >/dev/null
  for _ in $(seq 1 15); do tvsh dumpsys window | grep -m1 mCurrentFocus | grep -q youtube && break; sleep 1; done
  sleep 3
  r="$(check_screen open)" || exit 1; grep -v '^profile$' <<<"$r" || true
  if grep -qx profile <<<"$r"; then
    say "   'Who's watching?' shown: choosing the highlighted (last used) profile"
    key KEYCODE_DPAD_CENTER 4
  fi

  local id="" re='^https?://[^ ]*(v=|youtu\.be/|/shorts/|/live/)([A-Za-z0-9_-]{11})'
  if [[ $what =~ $re ]]; then id="${BASH_REMATCH[2]}"; fi

  if [ -n "$id" ]; then
    say "3/5 Open video $id"
    tvsh am start -a android.intent.action.VIEW -d "$(shq "https://www.youtube.com/watch?v=$id")" -n "$comp" >/dev/null
    sleep 6
  else
    say "3/5 Search YouTube for: $what"
    tvsh am start -a android.intent.action.SEARCH -n "$comp" -e query "$(shq "$what")" >/dev/null
    sleep 5
    say "4/5 Check the results, then select the first one"
    r="$(check_screen results)" || exit 1; grep -v '^profile$' <<<"$r" || true
    key KEYCODE_DPAD_CENTER 7
    if ! yt_playing; then
      say "   not playing yet: move down to the first result and press OK"
      r="$(check_screen retry)" || exit 1; grep -v '^profile$' <<<"$r" || true
      key KEYCODE_DPAD_DOWN 1; key KEYCODE_DPAD_CENTER 7
    fi
  fi

  say "5/5 Verify playback (screenshots of video can be black because of DRM; checking the media session instead)"
  for _ in $(seq 1 10); do yt_playing && { echo "  ▶ YouTube is playing."; return 0; }; sleep 1; done
  echo "  Not confirmed as playing. Look at the TV; ./tv.sh status shows what is on screen."
  return 1
}

cmd_monitor() {
  touch "$LOG"
  echo "Watching $LOG — commands in cyan, TV logcat (only while a command runs) in grey. Ctrl+C to stop."
  tail -n 0 -F "$LOG" | awk '/^\[[0-9-]+ [0-9:]+\] (\$|exit)/{print "\033[1;36m" $0 "\033[0m"; fflush(); next}
                             {print "\033[2m    │ " $0 "\033[0m"; fflush()}'
}

cmd_help() { sed -n '/^## Cheat sheet/,/^## /p' "$HERE/README.md" 2>/dev/null | sed '$d' || true; }

c="${1:-help}"; shift || true
case "$c" in
  install-adb) cmd_install_adb ;;
  connect)     cmd_connect "$@" ;;
  pair)        cmd_pair "$@" ;;
  status)      cmd_status ;;
  backup)      cmd_backup ;;
  scan)        cmd_scan ;;
  disable)     cmd_disable "$@" ;;
  tune)        cmd_tune ;;
  install-gh)  cmd_install_gh "$@" ;;
  youtube)     cmd_youtube "$@" ;;
  monitor)     cmd_monitor ;;
  undo)        cmd_undo ;;
  shell)       need_tv; tvrun shell "$@" ;;
  key)         need_tv; key "${1:?keycode, e.g. KEYCODE_HOME}" 0 ;;
  *)           cmd_help ;;
esac
