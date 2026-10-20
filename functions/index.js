const { setGlobalOptions } = require('firebase-functions/v2');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const Stripe = require('stripe');
const V = require('./vouchers');
const { fulfillSession } = require('./fulfill');

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const SITE_URL = defineString('SITE_URL', { description: 'Öffentliche URL der Seite, z. B. https://balance-zeit.web.app' });
const ADMIN_EMAILS = defineString('ADMIN_EMAILS', { description: 'Kommagetrennte E-Mails, die Gutscheine einlösen dürfen' });

const stripeClient = () => new Stripe(STRIPE_SECRET_KEY.value());
const siteUrl = () => SITE_URL.value().replace(/\/$/, '');

// Öffentliche Felder für die Danke-Seite
const publicVoucher = (v) => ({
  code: v.code, title: v.title, amountCents: v.amountCents,
  recipientName: v.recipientName, message: v.message, buyerName: v.buyerName,
});

const fulfill = (session) => fulfillSession(db, session, siteUrl());

// POST /api/checkout – Formular → Stripe-Checkout-URL
exports.createCheckout = onRequest({ secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  let order;
  try {
    order = V.validateOrder(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      locale: 'de',
      customer_email: order.buyerEmail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: order.amountCents,
          product_data: {
            name: `Gutschein · ${order.title}`,
            description: order.recipientName ? `Für ${order.recipientName}` : 'Einlösbar in 1220 Wien',
          },
        },
      }],
      metadata: {
        product: order.product, title: order.title, recipientName: order.recipientName,
        message: order.message, buyerName: order.buyerName,
      },
      success_url: `${siteUrl()}/gutschein-danke?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/gutschein`,
    });
    res.json({ url: session.url });
  } catch (e) {
    logger.error('Checkout fehlgeschlagen', e);
    res.status(500).json({ error: 'Die Zahlung konnte gerade nicht gestartet werden. Bitte später erneut versuchen.' });
  }
});

// POST /api/stripe-webhook – Stripe meldet die erfolgreiche Zahlung
exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
  } catch (e) {
    logger.warn('Ungültige Webhook-Signatur', e.message);
    return res.status(400).send('Ungültige Signatur');
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await fulfill(event.data.object);
  }
  res.json({ received: true });
});

// GET /api/voucher?session_id=… – Danke-Seite zeigt den Gutschein an
exports.getVoucher = onRequest({ secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  const sessionId = String(req.query.session_id || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return res.status(400).json({ error: 'Ungültiger Link' });
  try {
    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    const voucher = await fulfill(session);
    if (!voucher) return res.status(202).json({ pending: true });
    res.set('Cache-Control', 'no-store').json(publicVoucher(voucher));
  } catch (e) {
    logger.error('Gutschein abrufen fehlgeschlagen', e);
    res.status(404).json({ error: 'Gutschein nicht gefunden' });
  }
});

// ---- Admin (Einlösen vor Ort) ----
function requireAdmin(request) {
  const email = request.auth?.token?.email?.toLowerCase();
  const allowed = ADMIN_EMAILS.value().split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) throw new HttpsError('permission-denied', 'Kein Zugriff.');
  return email;
}

const adminView = (v) => ({
  ...v,
  createdAt: v.createdAt?.toMillis?.() ?? null,
  redemptions: (v.redemptions || []).map((r) => ({ ...r, at: r.at?.toMillis?.() ?? r.at })),
});

exports.lookupVoucher = onCall(async (request) => {
  requireAdmin(request);
  const code = V.normalizeCode(request.data?.code);
  if (!code) throw new HttpsError('invalid-argument', 'Der Code hat das Format BZ-XXXX-XXXX.');
  const snap = await db.doc(`vouchers/${code}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Gutschein nicht gefunden.');
  return adminView(snap.data());
});

exports.redeemVoucher = onCall(async (request) => {
  const by = requireAdmin(request);
  const code = V.normalizeCode(request.data?.code);
  if (!code) throw new HttpsError('invalid-argument', 'Ungültiger Code.');
  const ref = db.doc(`vouchers/${code}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Gutschein nicht gefunden.');
    const v = snap.data();
    let r;
    try {
      r = V.applyRedemption(v, request.data?.amountCents);
    } catch (e) {
      throw new HttpsError('failed-precondition', e.message);
    }
    const redemption = { cents: r.cents, at: Timestamp.now(), by, note: String(request.data?.note || '').slice(0, 200) };
    tx.update(ref, {
      remainingCents: r.remainingCents,
      status: r.status,
      redemptions: FieldValue.arrayUnion(redemption),
    });
    return adminView({ ...v, remainingCents: r.remainingCents, status: r.status, redemptions: [...(v.redemptions || []), redemption] });
  });
});

exports.listVouchers = onCall(async (request) => {
  requireAdmin(request);
  const snap = await db.collection('vouchers').orderBy('createdAt', 'desc').limit(30).get();
  return snap.docs.map((d) => adminView(d.data()));
});

