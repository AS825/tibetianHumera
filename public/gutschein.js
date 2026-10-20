// Gutschein-Formular: Live-Vorschau und Weiterleitung zu Stripe Checkout
const form = document.getElementById('voucherForm');
const $ = (id) => document.getElementById(id);
const amountBox = $('amountBox');
const amountInput = $('amountEuro');
const chips = [...document.querySelectorAll('.chip')];
const errorBox = $('formError');
const payBtn = $('payBtn');
const PAY_HTML = payBtn.innerHTML;
const resetPay = () => { payBtn.disabled = false; payBtn.innerHTML = PAY_HTML; render(); };

const PRODUCTS = {
  balance: { title: 'Balance-Zeit · ca. 90 Minuten', euro: () => 85 },
  wert: { title: 'Wertgutschein', euro: () => Number(amountInput.value) || 0 },
};
const fmt = (n) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n);
const product = () => form.product.value;

let lastAmount;
function render() {
  const p = PRODUCTS[product()];
  const euro = p.euro();
  amountBox.classList.toggle('open', product() === 'wert');
  $('pvTitle').textContent = p.title;
  $('pvAmount').textContent = fmt(euro);
  $('payAmount').textContent = fmt(euro).replace(',00', '');
  if (lastAmount !== undefined && lastAmount !== euro) {
    $('pvAmount').classList.add('bump');
    setTimeout(() => $('pvAmount').classList.remove('bump'), 300);
  }
  lastAmount = euro;
  const name = form.recipientName.value.trim();
  $('pvFor').innerHTML = '';
  $('pvFor').append('Für: ', Object.assign(document.createElement('strong'), { textContent: name || 'Sie' }));
  const msg = form.message.value.trim();
  $('pvMsg').textContent = msg ? `„${msg}“` : '';
  $('msgCount').textContent = form.message.value.length;
  chips.forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.amount) === Number(amountInput.value))));
}

chips.forEach((c) => c.addEventListener('click', () => { amountInput.value = c.dataset.amount; render(); }));
form.addEventListener('input', render);
form.addEventListener('change', render);
render();

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = !msg;
  if (msg) errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const data = {
    product: product(),
    amountEuro: Number(amountInput.value),
    recipientName: form.recipientName.value,
    message: form.message.value,
    buyerName: form.buyerName.value,
    buyerEmail: form.buyerEmail.value,
    acceptTerms: form.acceptTerms.checked,
  };
  // Kurze Prüfung im Browser – die verbindliche Prüfung macht der Server
  if (data.product === 'wert' && (data.amountEuro < 20 || data.amountEuro > 500 || data.amountEuro % 5)) {
    return showError('Bitte einen Betrag zwischen 20 € und 500 € in 5-€-Schritten wählen.');
  }
  if (!data.buyerName.trim()) return showError('Bitte geben Sie Ihren Namen an.');
  if (!form.buyerEmail.checkValidity() || !data.buyerEmail) return showError('Bitte geben Sie eine gültige E-Mail-Adresse an.');
  if (!data.acceptTerms) return showError('Bitte bestätigen Sie die AGB und die Datenschutzerklärung.');

  payBtn.disabled = true;
  payBtn.innerHTML = '<span class="spinner"></span> Weiter zu Stripe …';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) throw new Error(json.error || 'Die Zahlung konnte nicht gestartet werden.');
    location.href = json.url;
  } catch (err) {
    showError(err.message);
    resetPay();
  }
});

// Beim Zurückkommen von Stripe (Zurück-Taste) den Button wieder freigeben
addEventListener('pageshow', (e) => { if (e.persisted) resetPay(); });
