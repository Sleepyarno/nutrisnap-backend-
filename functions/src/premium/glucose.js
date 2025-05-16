const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendUserNotification } = require('../notifications/fcm');

// Predict glucose response (premium feature)
exports.predictGlucoseResponse = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  const userId = context.auth.uid;
  const { scanId } = data;

  if (!scanId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Scan ID is required'
    );
  }

  // Check if user is premium
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  const isPremium = userDoc.exists && (userDoc.data().isPremium || (userDoc.data().subscriptionDetails && userDoc.data().subscriptionDetails.isActive));
  if (!isPremium) {
    throw new functions.https.HttpsError('permission-denied', 'Premium feature. Upgrade required.');
  }

  // Fetch scan data
  const scanRef = admin.firestore().collection('users').doc(userId).collection('scans').doc(scanId);
  const scanDoc = await scanRef.get();
  if (!scanDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Scan not found');
  }

  // TODO: Replace with real glucose prediction model
  // For now, generate synthetic prediction data
  const glucosePrediction = {
    timePoints: [0, 30, 60, 90, 120],
    values: [90, 120, 150, 110, 95],
    peakValue: 150,
    peakTime: 60
  };

  // Write prediction to scan doc
  await scanRef.set({ glucosePrediction }, { merge: true });

  // Send notification if user has fcmToken
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (userDoc.exists && userDoc.data().fcmToken) {
      await sendUserNotification(userId, {
        notification: {
          title: 'Scan Result Ready',
          body: 'Your glucose prediction is now available.'
        },
        data: { scanId, eventType: 'scan_result_ready' }
      });
    }
  } catch (err) { /* ignore FCM errors for backend reliability */ }

  return { glucosePrediction };
});
