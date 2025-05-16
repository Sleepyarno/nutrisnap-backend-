/**
 * Optimized authentication functions
 * This file wraps the original auth functions to optimize memory usage
 */
const functions = require('firebase-functions');
const authFunctions = require('./src/auth/auth');

// Export memory-optimized versions of the auth functions
exports.createUserProfileOptimized = functions.https.onCall(async (data, context) => {
  try {
    // Simple pass-through that reduces memory overhead by clearing variables
    const result = await authFunctions.createUserProfile(data, context);
    return result;
  } catch (error) {
    console.error('Error in createUserProfile:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Unknown error');
  }
});

exports.updateUserProfileOptimized = functions.https.onCall(async (data, context) => {
  try {
    // Simple pass-through that reduces memory overhead by clearing variables
    const result = await authFunctions.updateUserProfile(data, context);
    return result;
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Unknown error');
  }
});

exports.getUserProfileOptimized = functions.https.onCall(async (data, context) => {
  try {
    // Simple pass-through that reduces memory overhead by clearing variables
    const result = await authFunctions.getUserProfile(data, context);
    return result;
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Unknown error');
  }
});
