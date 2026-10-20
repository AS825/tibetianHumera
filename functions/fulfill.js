const { FieldValue } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
const V = require('./vouchers');

// Legt den Gutschein nach erfolgreicher Zahlung genau einmal an (Webhook und Danke-Seite rufen das beide auf).
async function fulfillSession(db, session, siteUrl) {
  if (session.payment_status !== 'paid') return null;
  const m = session.metadata || {};
  const sessionRef = db.doc(`checkoutSessions/${session.id}`);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(sessionRef);
    if (existing.exists) {
      const snap = await tx.get(db.doc(`vouchers/${existing.data().code}`));
      return snap.data();
    }

    let code;
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = V.generateCode();
      if (!(await tx.get(db.doc(`vouchers/${candidate}`))).exists) code = candidate;
    }
    if (!code) throw new Error('Kein freier Gutscheincode gefunden');

    const voucher = {
      code,
      product: m.product,
      title: m.title,
      amountCents: session.amount_total,
      remainingCents: session.amount_total,
      status: 'offen',
      recipientName: m.recipientName || '',
      message: m.message || '',
      buyerName: m.buyerName || '',
      buyerEmail: session.customer_details?.email || session.customer_email || '',
      sessionId: session.id,
      createdAt: FieldValue.serverTimestamp(),
      redemptions: [],
    };
    tx.set(db.doc(`vouchers/${code}`), voucher);
    tx.set(sessionRef, { code, createdAt: FieldValue.serverTimestamp() });
    // Versand über die Firebase-Erweiterung „Trigger Email“ (Sammlung „mail“)
    if (voucher.buyerEmail) {
      tx.set(db.collection('mail').doc(), {
        to: voucher.buyerEmail,
        message: { subject: `Ihr Gutschein: ${voucher.title}`, html: V.voucherEmailHtml(voucher, siteUrl) },
      });
    }
    logger.info('Gutschein erstellt', { code, sessionId: session.id });
    return voucher;
  });
}

module.exports = { fulfillSession };
