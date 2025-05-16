/* eslint-env node */
// Meal Entry Model
// Handles database operations for meal tracking and glucose predictions

const admin = require('firebase-admin');
const logger = require("firebase-functions/logger");
const { calculateMealGlucoseImpact, generateGlucoseCurve, generateFoodSwapSuggestions, generateGlucoseAdvice } = require('./glucoseService');

// Get Firestore database reference
const db = admin.firestore();
const mealEntriesCollection = 'mealEntries';

/**
 * Create a new meal entry in the database
 * @param {string} userId - User ID
 * @param {object} mealData - Meal entry data
 * @returns {Promise<object>} - Created meal entry with ID
 */
async function createMealEntry(userId, mealData) {
  try {
    // Validate required fields
    if (!userId) throw new Error('User ID is required');
    if (!mealData.foods || !Array.isArray(mealData.foods) || mealData.foods.length === 0) {
      throw new Error('Meal must contain at least one food item');
    }
    
    // Set default datetime if not provided
    if (!mealData.datetime) {
      mealData.datetime = admin.firestore.Timestamp.now();
    } else if (!(mealData.datetime instanceof admin.firestore.Timestamp)) {
      // Convert to Firestore timestamp if a Date object or timestamp string is provided
      mealData.datetime = admin.firestore.Timestamp.fromDate(
        typeof mealData.datetime === 'string' ? new Date(mealData.datetime) : mealData.datetime
      );
    }
    
    // Calculate glucose impact using the service
    const glucoseImpact = calculateMealGlucoseImpact(mealData.foods);
    
    // Generate glucose curve
    const glucoseCurve = generateGlucoseCurve(mealData.baselineGlucose || 83, glucoseImpact.totalImpact);
    
    // Generate food swap suggestions
    const swapSuggestions = generateFoodSwapSuggestions(mealData.foods);
    
    // Generate meal advice
    const advice = generateGlucoseAdvice(glucoseImpact.totalImpact);
    
    // Prepare complete entry
    const mealEntry = {
      userId,
      ...mealData,
      estimatedGlucoseImpact: glucoseImpact.totalImpact,
      impactLevel: glucoseImpact.impactLevel,
      foodImpactDetails: glucoseImpact.details,
      glucoseCurve,
      swapSuggestions,
      advice,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Add to database
    const docRef = await db.collection(mealEntriesCollection).add(mealEntry);
    
    // Return created entry with ID
    return {
      id: docRef.id,
      ...mealEntry
    };
  } catch (error) {
    logger.error('Error creating meal entry:', error);
    throw error;
  }
}

/**
 * Get a single meal entry by ID
 * @param {string} userId - User ID
 * @param {string} mealId - Meal entry ID
 * @returns {Promise<object|null>} - Meal entry or null if not found
 */
async function getMealEntry(userId, mealId) {
  try {
    const docRef = await db.collection(mealEntriesCollection).doc(mealId).get();
    
    if (!docRef.exists) {
      return null;
    }
    
    const mealData = docRef.data();
    
    // Verify this entry belongs to the user
    if (mealData.userId !== userId) {
      throw new Error('Unauthorized access to meal entry');
    }
    
    return {
      id: docRef.id,
      ...mealData
    };
  } catch (error) {
    logger.error('Error retrieving meal entry:', error);
    throw error;
  }
}

/**
 * Get meal entries for a user with optional filtering
 * @param {string} userId - User ID
 * @param {object} options - Filter options
 * @returns {Promise<Array>} - Array of meal entries
 */
async function getMealEntries(userId, options = {}) {
  try {
    let query = db.collection(mealEntriesCollection).where('userId', '==', userId);
    
    // Apply date range filter if provided
    if (options.startDate) {
      const startTimestamp = admin.firestore.Timestamp.fromDate(
        typeof options.startDate === 'string' ? new Date(options.startDate) : options.startDate
      );
      query = query.where('datetime', '>=', startTimestamp);
    }
    
    if (options.endDate) {
      const endTimestamp = admin.firestore.Timestamp.fromDate(
        typeof options.endDate === 'string' ? new Date(options.endDate) : options.endDate
      );
      query = query.where('datetime', '<=', endTimestamp);
    }
    
    // Apply sorting
    query = query.orderBy('datetime', options.sortOrder || 'desc');
    
    // Apply pagination if provided
    if (options.limit) {
      query = query.limit(Number(options.limit));
    }
    
    // Execute query
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return [];
    }
    
    // Convert to array of meal entries with IDs
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    logger.error('Error retrieving meal entries:', error);
    throw error;
  }
}

/**
 * Update an existing meal entry
 * @param {string} userId - User ID
 * @param {string} mealId - Meal entry ID
 * @param {object} updateData - Updated meal data
 * @returns {Promise<object>} - Updated meal entry
 */
async function updateMealEntry(userId, mealId, updateData) {
  try {
    // Get the current entry
    const mealRef = db.collection(mealEntriesCollection).doc(mealId);
    const doc = await mealRef.get();
    
    if (!doc.exists) {
      throw new Error('Meal entry not found');
    }
    
    const currentData = doc.data();
    
    // Verify this entry belongs to the user
    if (currentData.userId !== userId) {
      throw new Error('Unauthorized access to meal entry');
    }
    
    // Prepare update data
    const updates = {
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Recalculate glucose impact if foods are updated
    if (updateData.foods) {
      const glucoseImpact = calculateMealGlucoseImpact(updateData.foods);
      updates.estimatedGlucoseImpact = glucoseImpact.totalImpact;
      updates.impactLevel = glucoseImpact.impactLevel;
      updates.foodImpactDetails = glucoseImpact.details;
      updates.glucoseCurve = generateGlucoseCurve(
        updateData.baselineGlucose || currentData.baselineGlucose || 83, 
        glucoseImpact.totalImpact
      );
      updates.swapSuggestions = generateFoodSwapSuggestions(updateData.foods);
      updates.advice = generateGlucoseAdvice(glucoseImpact.totalImpact);
    }
    
    // Update the document
    await mealRef.update(updates);
    
    // Return updated entry
    return {
      id: mealId,
      ...currentData,
      ...updates
    };
  } catch (error) {
    logger.error('Error updating meal entry:', error);
    throw error;
  }
}

/**
 * Delete a meal entry
 * @param {string} userId - User ID
 * @param {string} mealId - Meal entry ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteMealEntry(userId, mealId) {
  try {
    // Get the current entry
    const mealRef = db.collection(mealEntriesCollection).doc(mealId);
    const doc = await mealRef.get();
    
    if (!doc.exists) {
      throw new Error('Meal entry not found');
    }
    
    // Verify this entry belongs to the user
    if (doc.data().userId !== userId) {
      throw new Error('Unauthorized access to meal entry');
    }
    
    // Delete the document
    await mealRef.delete();
    
    return true;
  } catch (error) {
    logger.error('Error deleting meal entry:', error);
    throw error;
  }
}

/**
 * Get summary of meal entries for a date range
 * @param {string} userId - User ID
 * @param {object} options - Filter options
 * @returns {Promise<object>} - Summary data
 */
async function getMealsSummary(userId, options = {}) {
  try {
    // Get meals for the specified period
    const meals = await getMealEntries(userId, options);
    
    if (meals.length === 0) {
      return {
        totalMeals: 0,
        averageGlucoseImpact: 0,
        highestImpactMeal: null,
        lowestImpactMeal: null,
        impactByDay: [],
        impactByMealTime: {
          breakfast: 0,
          lunch: 0,
          dinner: 0,
          snack: 0
        }
      };
    }
    
    // Calculate summary statistics
    const totalImpact = meals.reduce((sum, meal) => sum + meal.estimatedGlucoseImpact, 0);
    const averageImpact = totalImpact / meals.length;
    
    // Find highest and lowest impact meals
    const sortedByImpact = [...meals].sort((a, b) => b.estimatedGlucoseImpact - a.estimatedGlucoseImpact);
    const highestImpactMeal = sortedByImpact[0];
    const lowestImpactMeal = sortedByImpact[sortedByImpact.length - 1];
    
    // Group impact by day
    const impactByDay = meals.reduce((result, meal) => {
      const date = meal.datetime.toDate().toISOString().split('T')[0];
      if (!result[date]) {
        result[date] = {
          date,
          totalImpact: 0,
          mealCount: 0,
          averageImpact: 0
        };
      }
      result[date].totalImpact += meal.estimatedGlucoseImpact;
      result[date].mealCount += 1;
      result[date].averageImpact = result[date].totalImpact / result[date].mealCount;
      return result;
    }, {});
    
    // Group impact by meal time
    const impactByMealTime = meals.reduce((result, meal) => {
      const mealType = meal.mealType || 'other';
      if (!result[mealType]) {
        result[mealType] = {
          type: mealType,
          totalImpact: 0,
          mealCount: 0,
          averageImpact: 0
        };
      }
      result[mealType].totalImpact += meal.estimatedGlucoseImpact;
      result[mealType].mealCount += 1;
      result[mealType].averageImpact = result[mealType].totalImpact / result[mealType].mealCount;
      return result;
    }, {});
    
    return {
      totalMeals: meals.length,
      averageGlucoseImpact: averageImpact,
      highestImpactMeal: {
        id: highestImpactMeal.id,
        datetime: highestImpactMeal.datetime,
        foods: highestImpactMeal.foods.map(f => f.name),
        impact: highestImpactMeal.estimatedGlucoseImpact
      },
      lowestImpactMeal: {
        id: lowestImpactMeal.id,
        datetime: lowestImpactMeal.datetime,
        foods: lowestImpactMeal.foods.map(f => f.name),
        impact: lowestImpactMeal.estimatedGlucoseImpact
      },
      impactByDay: Object.values(impactByDay),
      impactByMealTime: Object.values(impactByMealTime)
    };
  } catch (error) {
    logger.error('Error generating meals summary:', error);
    throw error;
  }
}

module.exports = {
  createMealEntry,
  getMealEntry,
  getMealEntries,
  updateMealEntry,
  deleteMealEntry,
  getMealsSummary
};
