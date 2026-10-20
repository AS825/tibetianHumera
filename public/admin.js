// Admin: Anmelden, Gutschein prüfen, (teilweise) einlösen
const $ = (id) => document.getElementById(id);
const auth = firebase.auth();
const fns = firebase.app().functions('europe-west1');
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  auth.useEmulator('http://127.0.0.1:9099');
  fns.useEmulator('127.0.0.1', 5001);
}
const call = (name, data) => fns.httpsCallable(name)(data).then((r) => r.data);
const fmt = (c) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(c / 100);
const date = (ms) => (ms ? new Date(ms).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const setErr = (id, msg) => { $(id).textContent = msg || ''; $(id).hidden = !msg; };

let current = null;

auth.onAuthStateChanged((user) => {
  $('loginForm').hidden = !!user;
  $('app').hidden = !user;
  if (user) loadRecent();
});

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setErr('loginErr');
  try {
    await auth.signInWithEmailAndPassword($('email').value, $('password').value);
  } catch {
    setErr('loginErr', 'Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
  }
});
$('logout').addEventListener('click', () => auth.signOut());

function show(v) {
  current = v;
  $('result').hidden = false;
  $('rCode').textContent = v.code;
  $('rStatus').textContent = v.status;
  $('rStatus').className = `status status--${v.status}`;
  $('rTitle').textContent = v.title;
  $('rAmount').textContent = fmt(v.amountCents);
  $('rRemaining').textContent = fmt(v.remainingCents);
  $('rFor').textContent = v.recipientName || '–';
  $('rBuyer').textContent = `${v.buyerName} (${v.buyerEmail})`;
  $('rDate').textContent = date(v.createdAt);
  $('rHistory').replaceChildren(...(v.redemptions || []).map((r) => {
    const li = document.createElement('li');
    li.className = 'card';
    li.textContent = `${date(r.at)} · ${fmt(r.cents)} eingelöst${r.note ? ` · ${r.note}` : ''}`;
    return li;
  }));
  const done = v.remainingCents <= 0;
  const partial = v.product === 'wert';
  $('redeemForm').hidden = done;
  $('partialField').hidden = !partial;
  $('redeemEuro').max = v.remainingCents / 100;
  $('redeemEuro').value = (v.remainingCents / 100).toFixed(2);
  $('redeemBtn').textContent = partial ? 'Betrag einlösen' : 'Balance-Zeit einlösen';
  setErr('redeemErr');
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function lookup(code) {
  setErr('lookupErr');
  $('result').hidden = true;
  try {
    show(await call('lookupVoucher', { code }));
  } catch (e) {
    setErr('lookupErr', e.message);
  }
}

$('lookupForm').addEventListener('submit', (e) => { e.preventDefault(); lookup($('code').value); });

$('redeemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const cents = Math.round(Number($('redeemEuro').value) * 100);
  const btn = $('redeemBtn');
  btn.disabled = true;
  setErr('redeemErr');
  try {
    show(await call('redeemVoucher', { code: current.code, amountCents: cents, note: $('note').value }));
    $('note').value = '';
    loadRecent();
  } catch (err) {
    setErr('redeemErr', err.message);
  } finally {
    btn.disabled = false;
  }
});

async function loadRecent() {
  try {
    const list = await call('listVouchers', {});
    $('recent').replaceChildren(...list.map((v) => {
      const li = document.createElement('li');
      li.className = 'card';
      li.style.cursor = 'pointer';
      li.innerHTML = '<div style="flex:1;min-width:0"><div class="mono"></div><div class="muted"></div></div><span class="status"></span>';
      li.querySelector('.mono').textContent = v.code;
      li.querySelector('.muted').textContent = `${fmt(v.amountCents)} · ${v.recipientName || v.buyerName} · ${date(v.createdAt)}`;
      li.querySelector('.status').textContent = v.status;
      li.querySelector('.status').classList.add(`status--${v.status}`);
      li.addEventListener('click', () => { $('code').value = v.code; lookup(v.code); });
      return li;
    }));
    if (!list.length) $('recent').innerHTML = '<li class="muted">Noch keine Gutscheine verkauft.</li>';
  } catch (e) {
    $('recent').innerHTML = '';
    setErr('lookupErr', e.code === 'functions/permission-denied' ? 'Dieses Konto hat keinen Zugriff.' : e.message);
  }
}
