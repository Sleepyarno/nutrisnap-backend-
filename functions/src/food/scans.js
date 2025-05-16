const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Helper: Ensure user is authenticated
function requireAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  return context.auth.uid;
}

// Callable: Create a new scan record
exports.createScan = functions.https.onCall(async (data, context) => {
  const userId = requireAuth(context);
  const { imageUrl } = data;
  if (!imageUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Image URL is required');
  }
  const scanRef = await admin.firestore()
    .collection('users').doc(userId)
    .collection('scans').add({
      imageUrl,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'processing'
    });
  return { scanId: scanRef.id };
});

// Callable: Update scan with results (analysis or error)
// Helper: Check if user is premium
async function checkPremium(userId) {
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  return !!userDoc.data().isPremium || (userDoc.data().subscriptionDetails && userDoc.data().subscriptionDetails.isActive);
}

exports.updateScan = functions.https.onCall(async (data, context) => {
  const userId = requireAuth(context);
  const { scanId, update } = data;
  if (!scanId || typeof update !== 'object') {
    throw new functions.https.HttpsError('invalid-argument', 'scanId and update object are required');
  }
  // If update includes premium fields, check premium status
  const premiumFields = ['glucosePrediction', 'metabolicAdvice'];
  const hasPremium = premiumFields.some(f => Object.prototype.hasOwnProperty.call(update, f));
  if (hasPremium) {
    const isPremium = await checkPremium(userId);
    if (!isPremium) {
      throw new functions.https.HttpsError('permission-denied', 'Premium features are only available for premium users.');
    }
  }
  const scanRef = admin.firestore()
    .collection('users').doc(userId)
    .collection('scans').doc(scanId);
  await scanRef.update({
    ...update,
    completedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { success: true };
});

// Callable: Get a single scan result
exports.getScanResult = functions.https.onCall(async (data, context) => {
  const userId = requireAuth(context);
  const { scanId } = data;
  if (!scanId) {
    throw new functions.https.HttpsError('invalid-argument', 'scanId is required');
  }
  const scanDoc = await admin.firestore()
    .collection('users').doc(userId)
    .collection('scans').doc(scanId)
    .get();
  if (!scanDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Scan not found');
  }
  return { id: scanDoc.id, ...scanDoc.data() };
});

// Callable: Get scan history for a user
exports.getScanHistory = functions.https.onCall(async (data, context) => {
  const userId = requireAuth(context);
  const { limit = 10 } = data;
  const scansSnap = await admin.firestore()
    .collection('users').doc(userId)
    .collection('scans')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return scansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});
