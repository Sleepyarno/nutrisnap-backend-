/* eslint-env node */
// Meal Tracking API Endpoints
// Provides endpoints for tracking meals and glucose predictions

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { createMealEntry, getMealEntry, getMealEntries, updateMealEntry, deleteMealEntry, getMealsSummary } = require('./mealEntry');

/**
 * Create a new meal entry
 * Endpoint: createMealEntry
 */
exports.createMealEntry = onCall(
  { enforceAppCheck: true, memory: "256MiB" },
  async (request) => {
    try {
      const { data, auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Validate premium status
      const isPremium = await checkPremiumStatus(auth.uid);
      if (!isPremium) {
        throw new Error('Premium subscription required for meal tracking');
      }
      
      // Create meal entry
      const mealEntry = await createMealEntry(auth.uid, data);
      logger.info(`Created meal entry for user ${auth.uid}`);
      
      return { success: true, mealEntry };
    } catch (error) {
      logger.error('Error creating meal entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Get a specific meal entry
 * Endpoint: getMealEntry
 */
exports.getMealEntry = onCall(
  { enforceAppCheck: true, memory: "128MiB" },
  async (request) => {
    try {
      const { data, auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Validate required data
      if (!data.mealId) {
        throw new Error('Meal ID is required');
      }
      
      // Validate premium status
      const isPremium = await checkPremiumStatus(auth.uid);
      if (!isPremium) {
        throw new Error('Premium subscription required for meal tracking');
      }
      
      // Get meal entry
      const mealEntry = await getMealEntry(auth.uid, data.mealId);
      
      if (!mealEntry) {
        return {
          success: false,
          error: 'Meal entry not found'
        };
      }
      
      return { success: true, mealEntry };
    } catch (error) {
      logger.error('Error retrieving meal entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Get meal entries with filtering options
 * Endpoint: getMealEntries
 */
exports.getMealEntries = onCall(
  { enforceAppCheck: true, memory: "256MiB" },
  async (request) => {
    try {
      const { data = {}, auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Validate premium status
      const isPremium = await checkPremiumStatus(auth.uid);
      if (!isPremium) {
        throw new Error('Premium subscription required for meal tracking');
      }
      
      // Get meal entries with filters
      const options = {
        startDate: data.startDate,
        endDate: data.endDate,
        limit: data.limit || 50,
        sortOrder: data.sortOrder || 'desc'
      };
      
      const mealEntries = await getMealEntries(auth.uid, options);
      
      return { 
        success: true, 
        mealEntries,
        pagination: {
          total: mealEntries.length,
          hasMore: mealEntries.length === options.limit
        }
      };
    } catch (error) {
      logger.error('Error retrieving meal entries:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Update an existing meal entry
 * Endpoint: updateMealEntry
 */
exports.updateMealEntry = onCall(
  { enforceAppCheck: true, memory: "256MiB" },
  async (request) => {
    try {
      const { data, auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Validate required data
      if (!data.mealId) {
        throw new Error('Meal ID is required');
      }
      
      // Validate premium status
      const isPremium = await checkPremiumStatus(auth.uid);
      if (!isPremium) {
        throw new Error('Premium subscription required for meal tracking');
      }
      
      // Update meal entry
      const updatedMeal = await updateMealEntry(auth.uid, data.mealId, data.updates);
      logger.info(`Updated meal entry ${data.mealId} for user ${auth.uid}`);
      
      return { success: true, mealEntry: updatedMeal };
    } catch (error) {
      logger.error('Error updating meal entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Delete a meal entry
 * Endpoint: deleteMealEntry
 */
exports.deleteMealEntry = onCall(
  { enforceAppCheck: true, memory: "128MiB" },
  async (request) => {
    try {
      const { data, auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Validate required data
      if (!data.mealId) {
        throw new Error('Meal ID is required');
      }
      
      // Validate premium status
      const isPremium = await checkPremiumStatus(auth.uid);
      if (!isPremium) {
        throw new Error('Premium subscription required for meal tracking');
      }
      
      // Delete meal entry
      await deleteMealEntry(auth.uid, data.mealId);
      logger.info(`Deleted meal entry ${data.mealId} for user ${auth.uid}`);
      
      return { success: true };
    } catch (error) {
      logger.error('Error deleting meal entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Get meal summary statistics
 * Endpoint: getMealsSummary
 */
exports.getMealsSummary = onCall(
  { enforceAppCheck: true, memory: "256MiB" },
  async (request) => {
    try {
      const { data = {}, auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Validate premium status
      const isPremium = await checkPremiumStatus(auth.uid);
      if (!isPremium) {
        throw new Error('Premium subscription required for meal tracking');
      }
      
      // Get meals summary with filters
      const options = {
        startDate: data.startDate,
        endDate: data.endDate
      };
      
      const summary = await getMealsSummary(auth.uid, options);
      
      return { success: true, summary };
    } catch (error) {
      logger.error('Error retrieving meals summary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Helper function to check if a user has premium status
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Premium status
 */
async function checkPremiumStatus(userId) {
  try {
    // Import premium helper from the existing module
    const { checkUserPremiumStatus } = require('./premium');
    return await checkUserPremiumStatus(userId);
  } catch (error) {
    logger.error('Error checking premium status:', error);
    // Fallback to true during development/testing
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('Development environment - bypassing premium check');
      return true;
    }
    throw error;
  }
}
