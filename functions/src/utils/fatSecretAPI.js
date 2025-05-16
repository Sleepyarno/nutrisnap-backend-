/**
 * FatSecret API utility for NutriSnap
 * Handles OAuth2 authentication and API requests, incorporating improved token management.
 */
const fetch = require('node-fetch');
const logger = require('firebase-functions/logger');
// apiUtils is used by calling functions for response caching, not for token caching here.

// FatSecret API Endpoints
const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_API_URL = 'https://platform.fatsecret.com/rest/server.api';

// Token cache (module-level)
let _tokenCache = null;
let _tokenExpiry = 0;

/**
 * Get an access token for the FatSecret API.
 * Implements token caching with a 60-second safety margin.
 * Requests 'basic image-recognition' scope.
 * @returns {Promise<string>} The access token
 */
async function getAccessToken() {
  const now = Date.now();

  // Check if we have a valid cached token (with 60s safety margin)
  if (_tokenCache && _tokenExpiry > now + 60000) {
    logger.debug('Using cached FatSecret access token');
    return _tokenCache;
  }

  // Get client credentials from environment variables
  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.error('FatSecret API credentials not configured in process.env.');
    throw new Error('FatSecret API credentials not configured in process.env.');
  }

  try {
    logger.debug('Requesting new FatSecret access token...');
    // Request new token
    const tokenResponse = await fetch(FATSECRET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'premier',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(`FatSecret token request failed: ${errorText}`);
      throw new Error(`Failed to get access token from FatSecret: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    // Cache the token
    _tokenCache = tokenData.access_token;
    _tokenExpiry = now + (tokenData.expires_in * 1000); // Store expiry based on 'expires_in'

    logger.info('Successfully obtained new FatSecret access token.');
    return _tokenCache;
  } catch (error) {
    logger.error('Error getting FatSecret access token:', error);
    // Ensure the original error message is propagated if it's specific enough
    if (error.message.startsWith('Failed to get access token')) {
      throw error;
    }
    throw new Error(`Failed to authenticate with FatSecret: ${error.message}`);
  }
}

/**
 * Search for food items in the FatSecret database.
 * @param {string} query The food name to search for
 * @param {number} [maxResults=5] Maximum number of results to return
 * @param {string} [region=null] Region code for localization
 * @returns {Promise<Array>} Array of food items
 */
async function searchFoods(query, maxResults = 5, region = null) {
  try {
    const token = await getAccessToken();

    const params = new URLSearchParams({
      method: 'foods.search',
      format: 'json',
      max_results: maxResults.toString(),
      search_expression: query,
    });

    if (region) {
      params.append('region', region);
    }

    logger.debug(`Searching FatSecret foods with query: ${query}`);
    const response = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`FatSecret API search failed for query \"${query}\": ${errorText}`);
      throw new Error(`FatSecret API search failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.foods || !data.foods.food) {
      logger.info(`No FatSecret results found for query \"${query}\"`);
      return [];
    }

    const foods = Array.isArray(data.foods.food) ? data.foods.food : [data.foods.food];
    logger.info(`Found ${foods.length} FatSecret results for query \"${query}\"`);
    return foods;
  } catch (error) {
    logger.error(`Error searching FatSecret for query \"${query}\":`, error);
    throw new Error(`FatSecret search failed: ${error.message}`);
  }
}

/**
 * Get detailed information about a specific food item.
 * @param {string} foodId The FatSecret food ID
 * @param {string} [region=null] Region code for localization
 * @returns {Promise<Object>} Food item details
 */
async function getFoodDetails(foodId, region = null) {
  try {
    const token = await getAccessToken();

    const params = new URLSearchParams({
      method: 'food.get.v2',
      format: 'json',
      food_id: foodId,
      include_sub_categories: 'true' // Retained from original
    });

    if (region) {
      params.append('region', region);
    }

    logger.debug(`Getting FatSecret food details for ID: ${foodId}`);
    const response = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`FatSecret API food details failed for ID ${foodId}: ${errorText}`);
      throw new Error(`FatSecret API food details failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.food) {
      logger.warn(`Food details not found in FatSecret response for ID ${foodId}`);
      throw new Error('Food details not found');
    }
    logger.info(`Retrieved FatSecret details for food ID ${foodId}`);
    return data.food;
  } catch (error) {
    logger.error(`Error getting food details from FatSecret for ID ${foodId}:`, error);
    throw new Error(`FatSecret food details failed: ${error.message}`);
  }
}

/**
 * Get autocomplete suggestions for a food search query.
 * Uses foods.autocomplete.v2 if available, otherwise falls back to foods.search.
 * @param {string} expression The partial food name to get suggestions for
 * @param {number} [maxResults=10] Maximum number of results to return
 * @param {string} [region=null] Region code for localization
 * @returns {Promise<Array<string>>} Array of suggestion strings
 */
async function autocompleteSearch(expression, maxResults = 10, region = null) {
  if (!expression || expression.trim().length < 2) {
    return [];
  }
  try {
    const token = await getAccessToken();

    const params = {
      method: 'foods.autocomplete.v2', // Prefer v2 from original
      expression: expression.trim(),
      max_results: Math.min(maxResults, 10).toString(),
      format: 'json'
    };
    if (region) {
      params.region = region;
    }

    logger.debug(`Getting FatSecret autocomplete for expression: ${expression}`);
    const response = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If autocomplete.v2 fails (e.g., not available for 'basic' scope), try foods.search as a fallback.
      // This is a common pattern if the 'premier' scope is not granted.
      if (response.status === 400 || response.status === 403 || errorText.toLowerCase().includes("invalid method")) {
        logger.warn(`FatSecret foods.autocomplete.v2 failed for "${expression}" (Status: ${response.status}). Falling back to foods.search.`);
        const searchResults = await searchFoods(expression, maxResults, region);
        return searchResults.map(food => food.food_name);
      }
      logger.error(`FatSecret API autocomplete failed for "${expression}": ${errorText}`);
      throw new Error(`FatSecret API autocomplete failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.suggestions || !data.suggestions.suggestion) {
      logger.info(`No FatSecret autocomplete suggestions found for "${expression}" via v2.`);
      // Fallback to search if v2 returns empty suggestions structure
      const searchResults = await searchFoods(expression, maxResults, region);
      return searchResults.map(food => food.food_name);
    }

    const suggestions = Array.isArray(data.suggestions.suggestion)
      ? data.suggestions.suggestion
      : [data.suggestions.suggestion];
    logger.info(`Retrieved ${suggestions.length} FatSecret autocomplete suggestions for "${expression}"`);
    return suggestions;
  } catch (error) {
    logger.error(`Error getting autocomplete suggestions from FatSecret for "${expression}":`, error);
    // Fallback to search in case of any other error with autocomplete.v2
    try {
        logger.warn(`Falling back to foods.search for autocomplete on "${expression}" due to error: ${error.message}`);
        const searchResults = await searchFoods(expression, maxResults, region);
        return searchResults.map(food => food.food_name);
    } catch (searchError) {
        logger.error(`Fallback search for autocomplete also failed for "${expression}":`, searchError);
        throw new Error(`FatSecret autocomplete and fallback search failed: ${error.message}`);
    }
  }
}

/**
 * Recognize food from a Base64 encoded image string using FatSecret API.
 * @param {string} base64ImageString - The Base64 encoded image.
 * @param {string} [region='US'] - Optional ISO 3166-1 region code (e.g., 'US', 'GB').
 * @param {string} [language='en'] - Optional ISO 639-1 language code (e.g., 'en', 'es').
 * @returns {Promise<Object>} The API response from FatSecret.
 */
async function recognizeFoodFromImage(base64ImageString, region = 'US', language = 'en') {
  if (!base64ImageString) {
    logger.error('Base64 image string is required for image recognition.');
    throw new Error('Base64 image string is required for image recognition.');
  }

  try {
    const accessToken = await getAccessToken(); // Ensures 'basic image-recognition' scope is requested
    const FATSECRET_IMAGE_API_URL = 'https://platform.fatsecret.com/rest/image-recognition/v1'; // Specific endpoint from original

    logger.info(`Calling FatSecret image recognition API for region: ${region}, language: ${language}...`);
    const response = await fetch(FATSECRET_IMAGE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_b64: base64ImageString,
        include_food_data: true,
        region: region,
        language: language,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error(`FatSecret Image Recognition API request failed with status ${response.status}:`, responseText);
      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.error) {
          throw new Error(`FatSecret API Error (Code ${errorJson.error.code}): ${errorJson.error.message}`);
        }
      } catch (e) { /* Not a JSON error, or JSON parsing failed */ }
      throw new Error(`FatSecret Image Recognition API request failed. Status: ${response.status}. Response: ${responseText.substring(0, 500)}`);
    }

    logger.info('FatSecret Image Recognition API success.');
    return JSON.parse(responseText);
  } catch (error) {
    logger.error('Error in recognizeFoodFromImage:', error.message);
    if (typeof error !== 'string' && !(error instanceof Error && error.message.startsWith('FatSecret API Error'))) {
      logger.error('Full error object for recognizeFoodFromImage:', error);
    }
    throw error; 
  }
}

/**
 * Standardize nutrition information from a FatSecret food item.
 * Creates a flat structure for compatibility with the iOS app.
 * Based on extractNutritionInfo from fatsecret-deploy/fatSecretAPI.js, renamed and adapted.
 * @param {Object} fatSecretFood FatSecret food item from food.get.v2
 * @returns {Object} Processed nutrition information
 */
function standardizeNutritionData(fatSecretFood) {
  const nutrition = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbohydrates: 0,
    foodName: fatSecretFood.food_name || 'Unknown Food',
    foodId: fatSecretFood.food_id, // Added foodId
    brandName: fatSecretFood.brand_name || null, // Added brandName
    source: 'FatSecret',
    servingSize: '100g', // Default, will be updated
    microNutrients: {} // Changed to microNutrients object as in original fatSecretAPI
  };

  try {
    if (!fatSecretFood.servings || !fatSecretFood.servings.serving) {
      logger.warn(`No servings data for food: ${fatSecretFood.food_name} (ID: ${fatSecretFood.food_id}`);
      return nutrition;
    }

    const serving = Array.isArray(fatSecretFood.servings.serving)
      ? fatSecretFood.servings.serving[0] // Use the first serving if multiple exist
      : fatSecretFood.servings.serving;

    nutrition.servingSize = serving.serving_description || `${serving.metric_serving_amount || ''}${serving.metric_serving_unit || ''}`;
    if (!nutrition.servingSize) nutrition.servingSize = 'Per serving';


    nutrition.calories = parseFloat(serving.calories) || 0;
    nutrition.protein = parseFloat(serving.protein) || 0;
    nutrition.fat = parseFloat(serving.fat) || 0;
    nutrition.carbohydrates = parseFloat(serving.carbohydrate) || 0;

    // Micronutrients (flattened to match iOS expectations from fatsecret-deploy but placed in microNutrients object)
    if (serving.fiber) nutrition.microNutrients.fiber = parseFloat(serving.fiber) || 0;
    if (serving.sugar) nutrition.microNutrients.sugar = parseFloat(serving.sugar) || 0;
    if (serving.sodium) nutrition.microNutrients.sodium = parseFloat(serving.sodium) || 0;
    if (serving.potassium) nutrition.microNutrients.potassium = parseFloat(serving.potassium) || 0;
    if (serving.saturated_fat) nutrition.microNutrients.saturatedFat = parseFloat(serving.saturated_fat) || 0;
    if (serving.cholesterol) nutrition.microNutrients.cholesterol = parseFloat(serving.cholesterol) || 0;
    // Add other micronutrients as needed based on FatSecret's v2 response

    return nutrition;
  } catch (error) {
    logger.error(`Error standardizing FatSecret nutrition data for ${fatSecretFood.food_name}:`, error);
    return nutrition; // Return default nutrition on error
  }
}


/**
 * Get nutrition data for a food item from FatSecret.
 * Combines search, getDetails, and standardization.
 * Retained from original functions/src/utils/fatSecretAPI.js and adapted.
 * @param {string} foodLabel Food name to search for
 * @returns {Promise<Object|null>} Standardized nutrition data or null if not found/error.
 */
async function getNutritionFromFatSecret(foodLabel) {
  // This function will use the apiUtils.js for response caching, managed by its caller in fatSecretSearch.js
  try {
    if (!foodLabel || typeof foodLabel !== 'string' || foodLabel.trim() === '') {
        logger.warn('getNutritionFromFatSecret called with invalid foodLabel.');
        return null;
    }
    
    const trimmedFoodLabel = foodLabel.trim();
    logger.info(`Getting nutrition from FatSecret for: "${trimmedFoodLabel}"`);

    const searchResults = await searchFoods(trimmedFoodLabel, 1); // Search for top 1 result

    if (!searchResults || searchResults.length === 0) {
      logger.info(`No FatSecret search results found for "${trimmedFoodLabel}"`);
      return null;
    }

    const foodId = searchResults[0].food_id;
    if (!foodId) {
        logger.warn(`No food_id found in search result for "${trimmedFoodLabel}"`);
        return null;
    }
    
    const foodDetails = await getFoodDetails(foodId);
    if (!foodDetails) {
        logger.warn(`No foodDetails found for foodId "${foodId}" (${trimmedFoodLabel})`);
        return null;
    }

    const nutritionData = standardizeNutritionData(foodDetails);
    
    logger.info(`Successfully retrieved and standardized nutrition data from FatSecret for "${trimmedFoodLabel}"`);
    return nutritionData;

  } catch (error) {
    // Log the specific error, but return null to the caller as per original function's contract.
    logger.error(`Error in getNutritionFromFatSecret for "${foodLabel || 'unknown'}":`, error.message);
    // Avoid re-throwing if the error is already a detailed FatSecret error to prevent duplicate logging
    if (error.message && (error.message.includes('FatSecret API') || error.message.includes('Failed to get access token'))) {
      // These are already specific enough
    } else if (typeof error !== 'string') {
      logger.error('Full error object for getNutritionFromFatSecret:', error);
    }
    return null;
  }
}

module.exports = {
  getAccessToken,
  searchFoods,
  getFoodDetails,
  autocompleteSearch,
  recognizeFoodFromImage,
  standardizeNutritionData,
  getNutritionFromFatSecret // Retained from original for direct use
};
