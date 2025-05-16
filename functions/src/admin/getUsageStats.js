const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { isAdmin } = require('./utils');

// Callable function to return basic analytics (admin only)
exports.getUsageStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const uid = context.auth.uid;
  if (!(await isAdmin(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  // Count users
  const usersSnap = await admin.firestore().collection('users').get();
  const totalUsers = usersSnap.size;
  const premiumUsers = usersSnap.docs.filter(doc => doc.data().isPremium).length;
  // Count scans
  let totalScans = 0;
  for (const doc of usersSnap.docs) {
    const scansSnap = await admin.firestore().collection('users').doc(doc.id).collection('scans').get();
    totalScans += scansSnap.size;
  }
  // Count payments
  const paymentsSnap = await admin.firestore().collection('payments').get();
  const totalPayments = paymentsSnap.size;
  return {
    totalUsers,
    premiumUsers,
    totalScans,
    totalPayments
  };
});
