// Use Firebase Functions v1 for all auth functions to maintain consistency
const functionsV1 = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// Create user profile after sign up
// Note: Using v1 syntax for auth triggers as Firebase Functions v2 handles these differently
exports.createUserProfile = functionsV1.runWith({ memory: '512MB' }).auth.user().onCreate(async (user) => {
  try {
    // Create a user document in Firestore
    await admin.firestore().collection('users').doc(user.uid).set({
      email: user.email,
      displayName: user.displayName || '',
      createdAt: FieldValue.serverTimestamp(),
      isPremium: false,
      preferences: {
        notifications: true,
        darkMode: false
      }
    });
    
    console.log(`User profile created for ${user.uid}`);
    return null;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
});

// Update user profile
exports.updateUserProfile = functionsV1.runWith({ memory: '512MB' }).https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functionsV1.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { displayName, preferences } = data;
  
  try {
    const updateData = {};
    
    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }
    
    if (preferences !== undefined) {
      updateData.preferences = preferences;
    }
    
    await admin.firestore().collection('users').doc(userId).update({
      ...updateData,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw new functionsV1.https.HttpsError('internal', error.message);
  }
});

// Get user profile
exports.getUserProfile = functionsV1.runWith({ memory: '512MB' }).https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functionsV1.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functionsV1.https.HttpsError('not-found', 'User profile not found');
    }
    
    return userDoc.data();
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw new functionsV1.https.HttpsError('internal', error.message);
  }
});
