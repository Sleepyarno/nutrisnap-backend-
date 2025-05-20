const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendUserNotification } = require('../notifications/fcm');
const { predictGlucoseResponse: calculateGlucoseCurveInternal } = require('../food/detection.js'); // Import the renamed function

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

  const scanData = scanDoc.data();
  // Assuming scanData.nutritionalInfo contains the necessary fields based on GUIDES/06_premium_features.md
  // Default to 0 if values are not present or invalid to prevent errors
  const nutritionalInfo = scanData.nutritionalInfo || {}; // Ensure nutritionalInfo object exists
  const carbs = parseFloat(nutritionalInfo.carbs) || 0;
  const protein = parseFloat(nutritionalInfo.protein) || 0;
  const fat = parseFloat(nutritionalInfo.fat) || 0;
  const fiber = parseFloat(nutritionalInfo.microNutrients?.fiber) || 0; // Optional chaining for fiber

  const timePoints = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
  
  const predictedValues = calculateGlucoseCurveInternal(carbs, protein, fat, timePoints, fiber);

  let peakValue = 0;
  let peakTime = 0;
  if (predictedValues.length > 0) {
    peakValue = Math.max(...predictedValues);
    const peakIndex = predictedValues.indexOf(peakValue);
    if (peakIndex !== -1 && timePoints[peakIndex] !== undefined) {
      peakTime = timePoints[peakIndex];
    }
  }
  
  const glucosePrediction = {
    timePoints: timePoints,
    values: predictedValues,
    peakValue: peakValue,
    peakTime: peakTime
  };

  // Write prediction to scan doc
  await scanRef.set({ glucosePrediction }, { merge: true });

  // Send notification if user has fcmToken
  try {
    const userCheckDoc = await admin.firestore().collection('users').doc(userId).get(); // Re-fetch or use existing userDoc
    if (userCheckDoc.exists && userCheckDoc.data().fcmToken) {
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
