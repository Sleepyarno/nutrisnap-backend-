/* eslint-env node */
// Premium User Services
// Handles premium user verification and features

const admin = require('firebase-admin');
const logger = require("firebase-functions/logger");
const { onCall } = require("firebase-functions/v2/https");

// Get Firestore database reference
const db = admin.firestore();

/**
 * Check if a user has premium status
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} - Whether the user has premium status
 */
async function checkUserPremiumStatus(userId) {
  try {
    if (!userId) return false;
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      logger.warn(`User ${userId} not found when checking premium status`);
      return false;
    }
    
    const userData = userDoc.data();
    
    // Check if user has premium subscription
    return userData.premiumStatus === true || 
           (userData.subscription && userData.subscription.status === 'active');
  } catch (error) {
    logger.error('Error checking premium status:', error);
    return false;
  }
}

/**
 * Set premium status for a user (admin only)
 * @param {string} targetUserId - User ID to set premium status for
 * @param {boolean} isPremium - Premium status to set
 * @returns {Promise<boolean>} - Success status
 */
async function setUserPremiumStatus(targetUserId, isPremium) {
  try {
    await db.collection('users').doc(targetUserId).update({
      premiumStatus: isPremium,
      premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info(`Set premium status for user ${targetUserId} to ${isPremium}`);
    return true;
  } catch (error) {
    logger.error('Error setting premium status:', error);
    throw error;
  }
}

/**
 * Check premium status for the current user
 * Endpoint: checkPremiumStatus
 */
exports.checkPremiumStatus = onCall(
  { enforceAppCheck: true, memory: "128MiB" },
  async (request) => {
    try {
      const { auth } = request;
      
      // Check authentication
      if (!auth) {
        return { isPremium: false, error: 'Authentication required' };
      }
      
      const isPremium = await checkUserPremiumStatus(auth.uid);
      
      return { 
        isPremium,
        features: isPremium ? [
          'advanced_nutrition',
          'meal_tracking',
          'glucose_predictions',
          'food_recommendations'
        ] : []
      };
    } catch (error) {
      logger.error('Error checking premium status:', error);
      return {
        isPremium: false,
        error: error.message
      };
    }
  }
);

/**
 * API Endpoint to enable premium features for testing
 * Only available in development environment
 * Endpoint: enablePremiumForTesting
 */
exports.enablePremiumForTesting = onCall(
  { enforceAppCheck: true, memory: "128MiB" },
  async (request) => {
    try {
      const { auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Only allow in development environment
      if (process.env.NODE_ENV === 'production') {
        throw new Error('This function is only available in development environment');
      }
      
      await setUserPremiumStatus(auth.uid, true);
      
      return { 
        success: true,
        message: 'Premium features enabled for testing'
      };
    } catch (error) {
      logger.error('Error enabling premium for testing:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

// Export functions for internal use
module.exports = {
  checkUserPremiumStatus,
  setUserPremiumStatus
};
