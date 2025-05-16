const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { isAdmin } = require('./utils');

// Callable function to set a user's premium status (admin only)
exports.setUserPremiumStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const uid = context.auth.uid;
  if (!(await isAdmin(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  const { targetUserId, isPremium } = data;
  if (!targetUserId || typeof isPremium !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'targetUserId and isPremium (boolean) are required');
  }
  const userRef = admin.firestore().collection('users').doc(targetUserId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Target user not found');
  }
  await userRef.set({ isPremium }, { merge: true });
  return { success: true };
});
