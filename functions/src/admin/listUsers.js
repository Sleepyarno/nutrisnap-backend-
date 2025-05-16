const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { isAdmin } = require('./utils');

// Callable function to list all users (admin only, paginated)
exports.listUsers = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const uid = context.auth.uid;
  if (!(await isAdmin(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  const limit = data.limit || 20;
  const startAfter = data.startAfter || null;
  let query = admin.firestore().collection('users').orderBy('createdAt', 'desc').limit(limit);
  if (startAfter) query = query.startAfter(startAfter);
  const snap = await query.get();
  const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { users, last: users.length ? users[users.length-1].createdAt : null };
});
