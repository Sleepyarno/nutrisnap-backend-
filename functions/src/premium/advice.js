const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendUserNotification } = require('../notifications/fcm');

// Generate metabolic advice (premium feature)
exports.generateMetabolicAdvice = functions.https.onCall(async (data, context) => {
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

  // TODO: Replace with real advice generation model
  // For now, generate synthetic advice
  const metabolicAdvice = {
    impact: 'moderate',
    tips: ['Eat slower', 'Add fiber', 'Drink water before meal']
  };

  // Write advice to scan doc
  await scanRef.set({ metabolicAdvice }, { merge: true });

  // Send notification if user has fcmToken
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (userDoc.exists && userDoc.data().fcmToken) {
      await sendUserNotification(userId, {
        notification: {
          title: 'Scan Result Ready',
          body: 'Your metabolic advice is now available.'
        },
        data: { scanId, eventType: 'scan_result_ready' }
      });
    }
  } catch (err) { /* ignore FCM errors for backend reliability */ }

  return { metabolicAdvice };
});
