const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { isAdmin } = require('./utils');

// Callable function to return aggregate analytics (admin only)
exports.getUsageAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const uid = context.auth.uid;
  if (!(await isAdmin(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }

  // Aggregate metrics
  const usersSnap = await admin.firestore().collection('users').get();
  const totalUsers = usersSnap.size;
  const premiumUsers = usersSnap.docs.filter(doc => doc.data().isPremium || (doc.data().subscriptionDetails && doc.data().subscriptionDetails.isActive)).length;

  // Active users (last 30 days)
  const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
  const now = Date.now();
  let activeUsers = 0;
  for (const userDoc of usersSnap.docs) {
    const lastScanSnap = await admin.firestore().collection('users').doc(userDoc.id).collection('scans').orderBy('createdAt', 'desc').limit(1).get();
    if (!lastScanSnap.empty) {
      const lastScan = lastScanSnap.docs[0].data();
      if (lastScan.createdAt && now - lastScan.createdAt < THIRTY_DAYS) {
        activeUsers++;
      }
    }
  }

  // Total scans and scans per user
  let totalScans = 0;
  let scansPerUser = {};
  let premiumFeatureUsage = 0;
  for (const userDoc of usersSnap.docs) {
    const scansSnap = await admin.firestore().collection('users').doc(userDoc.id).collection('scans').get();
    totalScans += scansSnap.size;
    scansPerUser[userDoc.id] = scansSnap.size;
    // Premium feature usage: count scans with glucosePrediction or metabolicAdvice
    scansSnap.forEach(scanDoc => {
      const scan = scanDoc.data();
      if (scan.glucosePrediction || scan.metabolicAdvice) premiumFeatureUsage++;
    });
  }

  return {
    totalUsers,
    activeUsers,
    totalScans,
    scansPerUser,
    premiumUsers,
    premiumFeatureUsage,
  };
});
