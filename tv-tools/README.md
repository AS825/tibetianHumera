# Philips Android TV: cleanup and control over ADB

These tools are for the TV in the photo: a **Philips 2021 Android TV**, platform **TPM211EA**
(`PH1M_EA_9970A`, MediaTek MT9970 chip, **Android 11**, firmware `TPM211EA_R.101.001.005.115`).
That is Android TV, so ADB works. For the exact model number (for example 55OLED806/12), open
Settings → About or look at the label on the back.

Everything runs from your computer with `./tv.sh`. On **Windows** it runs in **Git Bash**, which comes with Git for Windows (see below). It also works on macOS and Linux.
Every change is written to `state/undo.sh` *before* the next one happens, and `./tv.sh undo` reverts all of them.
Nothing is uninstalled, nothing is rooted or flashed, and the scripts never type passwords or sign in.

## 1. On the TV (with the remote)

German menu names first, English in brackets. The exact names can differ slightly between firmware versions.

1. Press the **⚙ (Settings)** button → **Alle Einstellungen** (All settings) → **Android-Einstellungen** (Android settings).
2. **Geräteeinstellungen** (Device Preferences) → **Info** (About) → scroll down to **Build**.
3. Highlight **Build** and press **OK 7 times** until you see "Sie sind jetzt Entwickler" (You are now a developer).
4. Press **Back** once → open **Entwickleroptionen** (Developer options), now listed under Geräteeinstellungen.
5. Turn on **USB-Debugging** (USB debugging). If there is also **Kabelloses Debugging** (Wireless debugging), turn it on as well.
6. Find the IP address: **Android-Einstellungen → Netzwerk und Internet** (Network & Internet) → select your connected Wi-Fi or Ethernet → **IP-Adresse** (for example `192.168.1.57`).
   If you use Wireless debugging, its own screen shows `IP:Port`.
7. When the computer connects, the TV asks **"USB-Debugging zulassen?"** (Allow USB debugging?).
   Tick **"Von diesem Computer immer zulassen"** (Always allow from this computer) and press **OK**.

## 2. On the computer

**Windows, one-time setup:**
1. Install **Git for Windows** from the official site https://git-scm.com/download/win (default options). It includes Git Bash.
2. Download this folder: `git clone -b claude/lucid-carson-bk9beq https://github.com/AS825/tibetianHumera.git`
   (or download the branch as a ZIP from GitHub and unpack it).
3. Start menu → **Git Bash**, then go to the folder, e.g. `cd ~/tibetianHumera`.
4. The first time adb runs, Windows Firewall may ask about network access. Click **Allow** for **private networks**.
   Your home Wi-Fi/LAN should be set to *Private* (Settings → Network & Internet → your network → Network profile type).

Then, in Git Bash:

```bash
cd tv-tools
./tv.sh install-adb             # official Google platform-tools (Windows/macOS/Linux), only if adb is missing
./tv.sh monitor                 # in a SECOND Git Bash window: live log of every command + TV logcat
./tv.sh connect 192.168.1.57    # your TV's IP; then accept the prompt on the TV
./tv.sh backup                  # saves package lists, all settings and creates state/undo.sh
./tv.sh scan                    # lists every app, marks REVIEW candidates and protected ones
```

If `connect` is **refused**: on the TV open Developer options → Wireless debugging → *Pair device with pairing code*, then

```bash
./tv.sh pair 192.168.1.57:37123 482916     # IP:pairing-port and the 6-digit code shown on the TV
./tv.sh connect 192.168.1.57:41235         # IP:port shown on the main Wireless debugging screen
```

On **Windows**, if the connection times out: the PC and TV must be on the same router (not a guest Wi-Fi), and the network profile should be *Private*.
On **macOS**, "No route to host" usually means the terminal app has no Local Network access:
System Settings → Privacy & Security → **Local Network** → turn on Terminal (or iTerm/VS Code), restart it, retry.

## 3. Cleanup: proposal first, then your OK

Send me the output of `./tv.sh scan` (the file `state/scan.txt`). I'll fill in `cleanup-proposal.txt`
with the packages to **disable**: ads, recommendations, feedback, demo and shop/retail-mode apps, and preloaded promos you don't use.
These are never touched, and `disable` refuses them even if they are listed: TV provider and live-TV/tuner/channel/EPG apps,
the launcher, Google Play Services/Store, keyboards and input methods, TV inputs/HDMI-CEC, settings/setup, system UI, WebView,
Bluetooth/remote, the voice assistant, accessibility, YouTube, and anything I can't identify.

When you have checked the list:

```bash
./tv.sh disable cleanup-proposal.txt   # asks for YES; pm disable-user (reversible), never uninstall
./tv.sh tune                           # asks for YES; animations 0.5 + Private DNS dns.adguard-dns.com
```

## 4. Open-source app from its official GitHub release

```bash
./tv.sh install-gh truefedex/tv-bro    # TV Bro browser; any owner/repo works
```

It only accepts `.apk` files from `https://github.com/<owner>/<repo>/releases/download/…` of the latest release,
picks the build that matches the TV's CPU, prints the SHA-256 and records `pm uninstall` in the undo file.

## 5. YouTube with one command

```bash
./tv.sh youtube "lofi hip hop radio"                    # search and play the first result
./tv.sh youtube "https://www.youtube.com/watch?v=XXXXXXXXXXX"   # play a specific video
ASK=1 ./tv.sh youtube "..."                             # ask you before every OK press
```

Steps you'll see on the TV: Wake → Home key → YouTube opens → "Who's watching?" is answered with the
highlighted (last-used) profile → search results → OK on the first result → playback.
Before each OK it saves a screenshot in `logs/` and reads the screen (uiautomator dump). It **stops** if it sees
a sign-in, password, add-account or buy/rent screen. A screenshot of a playing video can be black because of DRM,
so playback is confirmed from the TV's media session (`state=3` = playing) instead.

Opening the app and sending the search text use Android intents (the same as selecting the YouTube tile
and typing on the on-screen keyboard); choosing the profile and the video are real remote key presses.

## Cheat sheet
```
./tv.sh connect <IP>[:port]     connect (accept on TV)      ./tv.sh pair <IP:port> <code>  wireless pairing
./tv.sh status                  model, Android, screen, settings
./tv.sh monitor                 live command log + logcat (run in a second terminal)
./tv.sh backup | scan           save state + undo file | list apps (changes nothing)
./tv.sh disable <file>          disable listed packages (asks YES, protected list enforced)
./tv.sh tune                    animations 0.5, Private DNS AdGuard (asks YES)
./tv.sh install-gh owner/repo   install latest APK from official GitHub releases
./tv.sh youtube "<words|URL>"   open YouTube and play          ASK=1 → confirm each OK
./tv.sh key KEYCODE_HOME        press one remote key (BACK, DPAD_UP/DOWN/LEFT/RIGHT, DPAD_CENTER, VOLUME_UP …)
./tv.sh shell <cmd>             any adb shell command, logged
./tv.sh undo                    revert everything in state/undo.sh (asks YES)
```

## Undo by hand

`./tv.sh undo` runs the commands in `state/undo.sh`, newest first. The same thing with plain adb:

```bash
adb shell pm enable --user 0 <package>          # for every package that was disabled
adb shell settings put global window_animation_scale 1.0       # or the value saved by backup
adb shell settings put global transition_animation_scale 1.0
adb shell settings put global animator_duration_scale 1.0
adb shell settings put global private_dns_mode opportunistic   # Android default ("Automatic")
adb shell settings delete global private_dns_specifier
adb shell pm uninstall <package>                # only for apps installed with install-gh
```

Turning off Developer options on the TV also removes ADB access. A factory reset restores every disabled app too,
but you don't need it: everything here is reversible with the commands above.

`state/`, `logs/`, `downloads/` and `platform-tools/` stay on your computer (git-ignored). They contain your TV's details,
so don't share them.
