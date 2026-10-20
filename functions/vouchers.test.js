const test = require('node:test');
const assert = require('node:assert');
const V = require('./vouchers');

const order = (o) => ({ buyerName: 'Anna', buyerEmail: 'anna@example.at', acceptTerms: true, ...o });

test('Code-Format und Normalisierung', () => {
  const code = V.generateCode();
  assert.match(code, /^BZ-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual(V.normalizeCode(code.toLowerCase().replace(/-/g, ' ')), code);
  assert.strictEqual(V.normalizeCode('ABCD2345'), 'BZ-ABCD-2345');
  assert.strictEqual(V.normalizeCode('BZ-123'), null);
});

test('Balance-Zeit hat einen festen Preis', () => {
  const o = V.validateOrder(order({ product: 'balance', amountEuro: 1 }));
  assert.strictEqual(o.amountCents, 8500);
});

test('Wertgutschein prüft den Betrag', () => {
  assert.strictEqual(V.validateOrder(order({ product: 'wert', amountEuro: 50 })).amountCents, 5000);
  assert.throws(() => V.validateOrder(order({ product: 'wert', amountEuro: 12 })));
  assert.throws(() => V.validateOrder(order({ product: 'wert', amountEuro: 52 })));
  assert.throws(() => V.validateOrder(order({ product: 'wert', amountEuro: 1000 })));
});

test('Pflichtfelder', () => {
  assert.throws(() => V.validateOrder(order({ product: 'x' })));
  assert.throws(() => V.validateOrder(order({ product: 'balance', buyerEmail: 'nope' })));
  assert.throws(() => V.validateOrder(order({ product: 'balance', acceptTerms: false })));
});

test('Einlösen', () => {
  const wert = { product: 'wert', amountCents: 10000, remainingCents: 10000 };
  assert.deepStrictEqual(V.applyRedemption(wert, 4000), { cents: 4000, remainingCents: 6000, status: 'teilweise' });
  assert.throws(() => V.applyRedemption(wert, 20000));
  const balance = { product: 'balance', amountCents: 8500, remainingCents: 8500 };
  assert.strictEqual(V.applyRedemption(balance, 1).status, 'eingelöst');
  assert.throws(() => V.applyRedemption({ ...balance, remainingCents: 0 }, 0));
});

test('E-Mail maskiert Eingaben', () => {
  const html = V.voucherEmailHtml({ code: 'BZ-AAAA-2222', title: 'X', amountCents: 8500, message: '<script>' }, 'https://x.web.app');
  assert.ok(!html.includes('<script>'));
});
