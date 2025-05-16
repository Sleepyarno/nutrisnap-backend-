/**
 * Standalone FatSecret API endpoints for NutriSnap
 * This module provides dedicated functions for querying the FatSecret nutrition database
 */
const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const fatSecretAPI = require('../utils/fatSecretAPI');
const apiUtils = require('../utils/apiUtils');

/**
 * Search for nutrition data using FatSecret API
 * @param {string} foodName - Name of food to search for
 * @returns {Object} Nutrition data in standardized format
 */
exports.searchFatSecretNutrition = onCall(
  { 
    enforceAppCheck: true,
    memory: "512MiB"
  },
  async (request) => {
    const { data } = request;
    try {
      // Basic validation
      if (!data.foodName) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing food name to search'
        );
      }

      const searchTerm = data.foodName.trim();
      logger.info(`Searching FatSecret for nutrition data: ${searchTerm}`);

      const cacheKey = `fatsecret_nutrition_${searchTerm.toLowerCase().replace(/\s+/g, '_')}`;
      const cachedNutrition = apiUtils.getCachedResponse(cacheKey);
      if (cachedNutrition) {
        logger.debug(`Returning cached nutrition data for "${searchTerm}"`);
        return {
          success: true,
          source: 'FatSecret',
          nutritionData: cachedNutrition,
          message: `Found cached nutrition data for "${searchTerm}" from FatSecret`
        };
      }

      // Call the FatSecret API utility
      const nutritionData = await fatSecretAPI.getNutritionFromFatSecret(searchTerm);

      // Handle no results
      if (!nutritionData) {
        logger.info(`No FatSecret nutrition data found for: ${searchTerm}`);
        return {
          success: false,
          message: `No nutrition data found for "${searchTerm}"`,
          source: 'FatSecret'
        };
      }

      apiUtils.cacheResponse(cacheKey, nutritionData, 86400); // Cache for 24 hours
      return {
        success: true,
        source: 'FatSecret',
        nutritionData,
        message: `Found nutrition data for "${searchTerm}" from FatSecret`
      };
    } catch (error) {
      logger.error(`Error searching FatSecret for "${data.foodName || 'unknown'}":`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error searching for nutrition data',
        error.message
      );
    }
  }
);

/**
 * Get food details by ID from FatSecret API
 * @param {string} foodId - FatSecret food ID
 * @returns {Object} Detailed food information
 */
exports.getFatSecretFoodDetails = onCall(
  { 
    enforceAppCheck: true,
    memory: "512MiB"
  },
  async (request) => {
    const { data } = request;
    try {
      // Basic validation
      if (!data.foodId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing food ID'
        );
      }

      const foodId = data.foodId;
      logger.info(`Getting FatSecret food details for ID: ${foodId}`);

      const cacheKey = `fatsecret_details_${foodId}`;
      const cachedFoodDetails = apiUtils.getCachedResponse(cacheKey);
      if (cachedFoodDetails) {
        logger.debug(`Returning cached food details for ID "${foodId}"`);
        const nutritionData = fatSecretAPI.standardizeNutritionData(cachedFoodDetails);
        return {
          success: true,
          foodDetails: cachedFoodDetails,
          nutritionData,
          source: 'FatSecret',
          message: `Found cached food details for ID "${foodId}" from FatSecret`
        };
      }

      // Call the FatSecret API utility
      const foodDetails = await fatSecretAPI.getFoodDetails(foodId);

      // Handle no results
      if (!foodDetails) {
        logger.info(`No FatSecret food details found for ID: ${foodId}`);
        return {
          success: false,
          message: `No food details found for ID "${foodId}"`,
          source: 'FatSecret'
        };
      }
      
      apiUtils.cacheResponse(cacheKey, foodDetails, 604800); // Cache raw details for 7 days
      const nutritionData = fatSecretAPI.standardizeNutritionData(foodDetails);
      
      return {
        success: true,
        foodDetails,
        nutritionData,
        source: 'FatSecret',
        message: `Found food details for ID "${foodId}" from FatSecret`
      };
    } catch (error) {
      logger.error(`Error getting FatSecret food details for ID "${data.foodId || 'unknown'}":`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error getting food details',
        error.message
      );
    }
  }
);

/**
 * Get autocomplete suggestions for food search from FatSecret API
 * @param {string} query - Partial text to get suggestions for
 * @param {number} maxResults - Maximum number of results (default 4, max 10)
 * @param {string} region - Optional region code (e.g. 'US', 'UK')
 * @returns {Array<string>} Array of suggested search terms
 */
exports.getAutocompleteSuggestions = onCall(
  { 
    enforceAppCheck: true,
    memory: "512MiB"
  },
  async (request) => {
    const { data } = request;
    try {
      // Basic validation
      if (!data.query) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing search query'
        );
      }

      const searchQuery = data.query.trim();
      const maxResults = data.maxResults || 4;
      const region = data.region || null;
      
      logger.info(`Getting autocomplete suggestions for query: ${searchQuery}, maxResults: ${maxResults}, region: ${region}`);

      const cacheKey = `fatsecret_autocomplete_${searchQuery.toLowerCase().replace(/\s+/g, '_')}_${maxResults}_${region || 'default'}`;
      const cachedSuggestions = apiUtils.getCachedResponse(cacheKey);

      if (cachedSuggestions) {
        logger.debug(`Returning cached autocomplete suggestions for "${searchQuery}"`);
        return {
          success: true,
          suggestions: cachedSuggestions,
          message: `Found ${cachedSuggestions.length} cached autocomplete suggestions for "${searchQuery}"`
        };
      }

      // Call the FatSecret API utility
      const suggestions = await fatSecretAPI.autocompleteSearch(searchQuery, maxResults, region);

      if (suggestions && suggestions.length > 0) {
        apiUtils.cacheResponse(cacheKey, suggestions, 900); // Cache for 15 minutes
      }

      // Return the suggestions
      return {
        success: true,
        suggestions,
        message: `Found ${suggestions.length} autocomplete suggestions for "${searchQuery}"`
      };
    } catch (error) {
      logger.error(`Error getting autocomplete suggestions for "${data.query || 'unknown'}":`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error getting autocomplete suggestions',
        error.message
      );
    }
  }
);
