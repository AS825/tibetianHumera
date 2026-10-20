// Reine Gutschein-Logik ohne Firebase/Stripe – dadurch einfach testbar.
const crypto = require('node:crypto');

// Preise werden nur hier (serverseitig) festgelegt, nie vom Browser übernommen.
const PRODUCTS = {
  balance: { title: 'Balance-Zeit · ca. 90 Minuten', amountCents: 8500, fixed: true },
  wert: { title: 'Wertgutschein', fixed: false, minCents: 2000, maxCents: 50000, stepCents: 500 },
};

// Ohne leicht verwechselbare Zeichen (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `BZ-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function normalizeCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.startsWith('BZ') ? raw.slice(2) : raw;
  if (body.length !== 8) return null;
  return `BZ-${body.slice(0, 4)}-${body.slice(4)}`;
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Prüft die Formulardaten und liefert die bereinigte Bestellung oder wirft einen Fehler mit deutscher Meldung.
function validateOrder(body) {
  const product = PRODUCTS[body?.product];
  if (!product) throw new Error('Bitte wählen Sie einen Gutschein.');

  let amountCents = product.amountCents;
  if (!product.fixed) {
    amountCents = Math.round(Number(body.amountEuro) * 100);
    if (!Number.isFinite(amountCents) || amountCents < product.minCents || amountCents > product.maxCents
      || amountCents % product.stepCents !== 0) {
      throw new Error(`Bitte einen Betrag zwischen ${product.minCents / 100} € und ${product.maxCents / 100} € in 5-€-Schritten wählen.`);
    }
  }

  const buyerName = clean(body.buyerName, 80);
  const buyerEmail = clean(body.buyerEmail, 120).toLowerCase();
  if (!buyerName) throw new Error('Bitte geben Sie Ihren Namen an.');
  if (!EMAIL_RE.test(buyerEmail)) throw new Error('Bitte geben Sie eine gültige E-Mail-Adresse an.');
  if (body.acceptTerms !== true) throw new Error('Bitte bestätigen Sie die AGB.');

  return {
    product: body.product,
    title: product.title,
    amountCents,
    recipientName: clean(body.recipientName, 80),
    message: clean(body.message, 300),
    buyerName,
    buyerEmail,
  };
}

// Status aus Restwert ableiten
function statusFor(amountCents, remainingCents) {
  if (remainingCents <= 0) return 'eingelöst';
  if (remainingCents < amountCents) return 'teilweise';
  return 'offen';
}

// Einlösung berechnen; Balance-Zeit wird immer komplett eingelöst.
function applyRedemption(voucher, requestedCents) {
  if (voucher.remainingCents <= 0) throw new Error('Dieser Gutschein wurde bereits vollständig eingelöst.');
  const cents = voucher.product === 'balance' ? voucher.remainingCents : Math.round(requestedCents);
  if (!Number.isInteger(cents) || cents <= 0) throw new Error('Bitte einen gültigen Betrag angeben.');
  if (cents > voucher.remainingCents) throw new Error('Der Betrag ist höher als der Restwert.');
  const remainingCents = voucher.remainingCents - cents;
  return { cents, remainingCents, status: statusFor(voucher.amountCents, remainingCents) };
}

const euro = (cents) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function voucherEmailHtml(v, siteUrl) {
  return `<div style="font-family:Poppins,Arial,sans-serif;background:#FFF9F1;padding:32px;color:#2B211E">
  <div style="max-width:480px;margin:auto;background:#FFFDFB;border-radius:20px;padding:28px;border:1px solid #EBD5C3">
    <p style="letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:#6B2A26;margin:0">Gutschein</p>
    <h1 style="font-weight:500;margin:8px 0 4px">${escapeHtml(v.title)}</h1>
    <p style="font-size:28px;color:#B98F6E;margin:0 0 16px">${euro(v.amountCents)}</p>
    ${v.recipientName ? `<p style="margin:0">Für: <strong>${escapeHtml(v.recipientName)}</strong></p>` : ''}
    ${v.message ? `<p style="font-style:italic;color:#7A6A62">„${escapeHtml(v.message)}“</p>` : ''}
    <p style="margin:20px 0 4px;font-size:13px;color:#7A6A62">Gutscheincode</p>
    <p style="font-size:24px;letter-spacing:.12em;font-weight:600;margin:0">${v.code}</p>
    <p style="font-size:13px;color:#7A6A62;margin-top:20px">Einlösbar bei Humera Shah · Tibetische Ku-Nye-Massage · 1220 Wien.<br>Termin per Direktnachricht auf Instagram.</p>
    <p style="font-size:13px"><a href="${siteUrl}" style="color:#6B2A26">${siteUrl.replace(/^https?:\/\//, '')}</a></p>
  </div></div>`;
}

module.exports = { PRODUCTS, generateCode, normalizeCode, validateOrder, applyRedemption, statusFor, euro, voucherEmailHtml };
