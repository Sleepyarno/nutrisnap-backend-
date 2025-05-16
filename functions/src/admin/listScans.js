const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { isAdmin } = require('./utils');

// Callable function to list all scans for any user (admin only, paginated)
exports.listScans = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const uid = context.auth.uid;
  if (!(await isAdmin(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  const targetUserId = data.userId;
  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Target userId is required');
  }
  const limit = data.limit || 20;
  const startAfter = data.startAfter || null;
  let query = admin.firestore().collection('users').doc(targetUserId).collection('scans').orderBy('createdAt', 'desc').limit(limit);
  if (startAfter) query = query.startAfter(startAfter);
  const snap = await query.get();
  const scans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { scans, last: scans.length ? scans[scans.length-1].createdAt : null };
});
