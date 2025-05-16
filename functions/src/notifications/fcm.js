const admin = require('firebase-admin');

// Utility: Send FCM notification to a user by uid
async function sendUserNotification(uid, payload) {
  // Fetch user FCM token from Firestore
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  const fcmToken = userDoc.exists && userDoc.data().fcmToken;
  if (!fcmToken) throw new Error('User has no FCM token');
  // Send notification
  return await admin.messaging().send({
    token: fcmToken,
    ...payload,
  });
}

module.exports = { sendUserNotification };
