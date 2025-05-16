/**
 * Standalone FatSecret Functions for NutriSnap
 * 
 * This file creates independent Cloud Functions for the FatSecret API
 * that can be deployed separately from the main application.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const fetch = require('node-fetch');

// Initialize Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e) {
  // App might already be initialized
}

// Cache utility functions
const apiUtils = {
  cache: {},
  
  getCachedResponse(key) {
    const cachedItem = this.cache[key];
    if (cachedItem && cachedItem.expires > Date.now()) {
      return cachedItem.data;
    }
    return null;
  },
  
  cacheResponse(key, data, ttlSeconds) {
    this.cache[key] = {
      data,
      expires: Date.now() + (ttlSeconds * 1000)
    };
  }
};

// FatSecret API Endpoints
const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_API_URL = 'https://platform.fatsecret.com/rest/server.api';
const TOKEN_CACHE_KEY = 'fatsecret_token';

/**
 * Get OAuth2 access token for FatSecret API
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  try {
    // Check if we have a cached token
    const cachedToken = apiUtils.getCachedResponse(TOKEN_CACHE_KEY);
    if (cachedToken && cachedToken.expires_at > Date.now()) {
      logger.debug('Using cached FatSecret access token');
      return cachedToken.access_token;
    }

    // Get client credentials from environment
    const clientId = process.env.FATSECRET_CLIENT_ID;
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.error('FatSecret API credentials not configured');
      throw new Error('FatSecret API credentials not configured');
    }

    // Request new token
    const tokenResponse = await fetch(FATSECRET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'basic', // Only using basic scope
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(`FatSecret token request failed: ${errorText}`);
      throw new Error(`Failed to get FatSecret token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Cache the token with expiration time (subtract 60 seconds for safety margin)
    const tokenWithExpiry = {
      ...tokenData,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000
    };
    
    apiUtils.cacheResponse(TOKEN_CACHE_KEY, tokenWithExpiry, tokenData.expires_in);
    
    logger.info('Successfully obtained new FatSecret access token');
    return tokenData.access_token;
  } catch (error) {
    logger.error('Error getting FatSecret access token:', error);
    throw error;
  }
}

/**
 * Search for food items in FatSecret database
 * @param {string} query Food name to search for
 * @param {number} maxResults Maximum number of results to return
 * @returns {Promise<Array>} Search results
 */
async function searchFoods(query, maxResults = 3) {
  try {
    // Generate cache key based on query
    const cacheKey = `fatsecret_search_${query.toLowerCase().trim()}`;
    
    // Check if we have cached results
    const cachedResults = apiUtils.getCachedResponse(cacheKey);
    if (cachedResults) {
      logger.debug(`Using cached FatSecret search results for "${query}"`);
      return cachedResults;
    }
    
    // Get access token
    const accessToken = await getAccessToken();
    
    // Make API request
    const searchResponse = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`
      },
      body: new URLSearchParams({
        method: 'foods.search',
        search_expression: query,
        max_results: maxResults.toString(),
        format: 'json'
      })
    });
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      logger.error(`FatSecret search request failed: ${errorText}`);
      throw new Error(`Failed to search FatSecret: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    // Handle empty results
    if (!searchData.foods || !searchData.foods.food) {
      logger.info(`No FatSecret results found for "${query}"`);
      return [];
    }
    
    // Handle single vs array results
    let foods = [];
    if (Array.isArray(searchData.foods.food)) {
      foods = searchData.foods.food;
    } else {
      foods = [searchData.foods.food];
    }
    
    // Cache results for 1 hour (3600 seconds)
    apiUtils.cacheResponse(cacheKey, foods, 3600);
    
    logger.info(`Retrieved ${foods.length} FatSecret search results for "${query}"`);
    return foods;
  } catch (error) {
    logger.error(`Error searching FatSecret for "${query}":`, error);
    throw error;
  }
}

/**
 * Get detailed food information by ID
 * @param {string} foodId FatSecret food ID
 * @returns {Promise<Object>} Food details
 */
async function getFoodDetails(foodId) {
  try {
    // Generate cache key based on food ID
    const cacheKey = `fatsecret_food_${foodId}`;
    
    // Check if we have cached results
    const cachedDetails = apiUtils.getCachedResponse(cacheKey);
    if (cachedDetails) {
      logger.debug(`Using cached FatSecret food details for ID ${foodId}`);
      return cachedDetails;
    }
    
    // Get access token
    const accessToken = await getAccessToken();
    
    // Make API request
    const detailsResponse = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`
      },
      body: new URLSearchParams({
        method: 'food.get.v2',
        food_id: foodId,
        format: 'json'
      })
    });
    
    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      logger.error(`FatSecret food details request failed: ${errorText}`);
      throw new Error(`Failed to get FatSecret food details: ${detailsResponse.status}`);
    }
    
    const detailsData = await detailsResponse.json();
    
    // Cache results for 7 days (604800 seconds)
    apiUtils.cacheResponse(cacheKey, detailsData.food, 604800);
    
    logger.info(`Retrieved FatSecret details for food ID ${foodId}`);
    return detailsData.food;
  } catch (error) {
    logger.error(`Error getting FatSecret food details for ID ${foodId}:`, error);
    throw error;
  }
}

/**
 * Convert FatSecret food data to NutriSnap's standardized format
 * @param {Object} fatSecretFood Food data from FatSecret API
 * @returns {Object} Standardized nutrition data
 */
function standardizeNutritionData(fatSecretFood) {
  // Default empty nutrition object
  const nutrition = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbohydrates: 0,
    foodName: fatSecretFood.food_name || 'Unknown Food',
    source: 'FatSecret',
    servingSize: '100g',
    microNutrients: {}
  };
  
  try {
    // Check if we have serving data
    if (!fatSecretFood.servings || !fatSecretFood.servings.serving) {
      return nutrition;
    }
    
    // Get the first serving (or the only serving if it's not an array)
    const serving = Array.isArray(fatSecretFood.servings.serving) 
      ? fatSecretFood.servings.serving[0] 
      : fatSecretFood.servings.serving;
    
    // Extract nutrition data
    nutrition.calories = parseFloat(serving.calories) || 0;
    nutrition.protein = parseFloat(serving.protein) || 0;
    nutrition.fat = parseFloat(serving.fat) || 0;
    nutrition.carbohydrates = parseFloat(serving.carbohydrate) || 0;
    nutrition.servingSize = serving.serving_description || '100g';
    
    // Extract micronutrients if available
    if (serving.fiber) nutrition.microNutrients.fiber = parseFloat(serving.fiber);
    if (serving.sugar) nutrition.microNutrients.sugar = parseFloat(serving.sugar);
    if (serving.sodium) nutrition.microNutrients.sodium = parseFloat(serving.sodium);
    if (serving.potassium) nutrition.microNutrients.potassium = parseFloat(serving.potassium);
    if (serving.cholesterol) nutrition.microNutrients.cholesterol = parseFloat(serving.cholesterol);
    if (serving.saturated_fat) nutrition.microNutrients.saturatedFat = parseFloat(serving.saturated_fat);
    
    return nutrition;
  } catch (error) {
    logger.error('Error standardizing FatSecret nutrition data:', error);
    return nutrition;
  }
}

/**
 * Get nutrition data for a food item from FatSecret
 * @param {string} foodLabel Food name to search for
 * @returns {Promise<Object|null>} Nutrition data or null if not found
 */
async function getNutritionFromFatSecret(foodLabel) {
  try {
    if (!foodLabel) return null;
    
    // Generate cache key
    const cacheKey = `fatsecret_nutrition_${foodLabel.toLowerCase().trim()}`;
    
    // Check cache
    const cachedNutrition = apiUtils.getCachedResponse(cacheKey);
    if (cachedNutrition) {
      logger.debug(`Using cached FatSecret nutrition data for "${foodLabel}"`);
      return cachedNutrition;
    }
    
    // Search for the food
    const searchResults = await searchFoods(foodLabel);
    
    if (!searchResults || searchResults.length === 0) {
      logger.info(`No FatSecret results found for "${foodLabel}"`);
      return null;
    }
    
    // Get details for the best match (first result)
    const foodId = searchResults[0].food_id;
    const foodDetails = await getFoodDetails(foodId);
    
    // Convert to standardized format
    const nutritionData = standardizeNutritionData(foodDetails);
    
    // Cache results for 24 hours (86400 seconds)
    apiUtils.cacheResponse(cacheKey, nutritionData, 86400);
    
    logger.info(`Successfully retrieved nutrition data from FatSecret for "${foodLabel}"`);
    return nutritionData;
  } catch (error) {
    logger.error(`Error getting nutrition from FatSecret for "${foodLabel}":`, error);
    return null;
  }
}

/**
 * Get autocomplete suggestions for food search
 * @param {string} expression - Partial text to get suggestions for
 * @param {number} maxResults - Maximum number of results (default 4, max 10)
 * @param {string} region - Optional region code (e.g. 'US', 'UK')
 * @returns {Promise<string[]>} - Array of suggestion strings
 */
async function autocompleteSearch(expression, maxResults = 4, region = null) {
  try {
    if (!expression || expression.trim().length < 2) {
      return [];
    }

    // Generate cache key based on query
    const cacheKey = `fatsecret_autocomplete_${expression.toLowerCase().trim()}_${maxResults}_${region || 'default'}`;
    
    // Check if we have cached results
    const cachedSuggestions = apiUtils.getCachedResponse(cacheKey);
    if (cachedSuggestions) {
      logger.debug(`Using cached FatSecret autocomplete for "${expression}"`);
      return cachedSuggestions;
    }
    
    // Get access token
    const accessToken = await getAccessToken();
    
    // Make API request - since autocomplete.v2 may not be available with basic scope,
    // we'll use a regular search and extract the food names as suggestions
    const searchResponse = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`
      },
      body: new URLSearchParams({
        method: 'foods.search',
        search_expression: expression.trim(),
        max_results: Math.min(maxResults, 10).toString(),
        format: 'json'
      })
    });
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      logger.error(`FatSecret search request failed: ${errorText}`);
      throw new Error(`Failed to get autocomplete suggestions: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    // Handle empty results
    if (!searchData.foods || !searchData.foods.food) {
      logger.info(`No autocomplete suggestions found for "${expression}"`);
      return [];
    }
    
    // Extract food names as suggestions
    let foods = Array.isArray(searchData.foods.food) 
      ? searchData.foods.food 
      : [searchData.foods.food];
    
    const suggestions = foods.map(food => food.food_name);
    
    // Cache for 15 minutes (900 seconds)
    apiUtils.cacheResponse(cacheKey, suggestions, 900);
    
    logger.info(`Retrieved ${suggestions.length} autocomplete suggestions for "${expression}"`);
    return suggestions;
  } catch (error) {
    logger.error(`Error getting autocomplete suggestions for "${expression}":`, error);
    return [];
  }
}

// ============ CLOUD FUNCTIONS ============

/**
 * Search for nutrition data using FatSecret API
 */
exports.searchFatSecretNutrition = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const { data, auth } = request;
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

      // Call the FatSecret API utility
      const nutritionData = await getNutritionFromFatSecret(searchTerm);

      // Handle no results
      if (!nutritionData) {
        logger.info(`No FatSecret nutrition data found for: ${searchTerm}`);
        return {
          success: false,
          message: `No nutrition data found for "${searchTerm}"`,
          source: 'FatSecret'
        };
      }

      // Return standardized nutrition data
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
 */
exports.getFatSecretFoodDetails = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const { data, auth } = request;
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

      // Call the FatSecret API utility
      const foodDetails = await getFoodDetails(foodId);

      // Handle no results
      if (!foodDetails) {
        logger.info(`No FatSecret food details found for ID: ${foodId}`);
        return {
          success: false,
          message: `No food details found for ID "${foodId}"`,
          source: 'FatSecret'
        };
      }

      // Return food details with standardized structure
      const nutritionData = standardizeNutritionData(foodDetails);
      
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
 */
exports.getAutocompleteSuggestions = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const { data, auth } = request;
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
      
      logger.info(`Getting autocomplete suggestions for query: ${searchQuery}`);

      // Call the FatSecret API utility
      const suggestions = await autocompleteSearch(searchQuery, maxResults, region);

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
