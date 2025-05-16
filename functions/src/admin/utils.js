const admin = require('firebase-admin');

// Utility to check if a user is admin
async function isAdmin(uid) {
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  return userDoc.exists && userDoc.data().role === 'admin';
}

module.exports = { isAdmin };
