const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Callable function: register or update FCM token for current user
exports.registerFcmToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const uid = context.auth.uid;
  const { fcmToken } = data;
  if (!fcmToken || typeof fcmToken !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'A valid fcmToken is required');
  }
  await admin.firestore().collection('users').doc(uid).set({ fcmToken }, { merge: true });
  return { success: true };
});
