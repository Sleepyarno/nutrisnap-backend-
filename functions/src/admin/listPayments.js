const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { isAdmin } = require('./utils');

// Callable function to list all payments (admin only, paginated)
exports.listPayments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const uid = context.auth.uid;
  if (!(await isAdmin(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  const limit = data.limit || 20;
  const startAfter = data.startAfter || null;
  let query = admin.firestore().collection('payments').orderBy('createdAt', 'desc').limit(limit);
  if (startAfter) query = query.startAfter(startAfter);
  const snap = await query.get();
  const payments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { payments, last: payments.length ? payments[payments.length-1].createdAt : null };
});
