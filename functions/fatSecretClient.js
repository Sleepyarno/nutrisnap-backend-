/**
 * Standalone FatSecret API Client for NutriSnap
 * 
 * This is a dedicated client for interacting with the FatSecret Platform API
 * that can be used independently of Firebase Functions.
 * 
 * Usage:
 *   node fatSecretClient.js search "apple"
 *   node fatSecretClient.js details 123456
 */

// Load environment variables
require('dotenv').config();
const fetch = require('node-fetch');

// FatSecret API Endpoints
const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_API_URL = 'https://platform.fatsecret.com/rest/server.api';

// Cache for access token (in-memory, not persistent)
let cachedToken = null;

/**
 * Get OAuth2 access token for FatSecret API
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  try {
    // Check if we have a cached token that's still valid
    if (cachedToken && cachedToken.expires_at > Date.now()) {
      console.log('Using cached FatSecret access token');
      return cachedToken.access_token;
    }

    // Get client credentials from environment
    const clientId = process.env.FATSECRET_CLIENT_ID;
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('FatSecret API credentials not configured in .env file');
    }

    console.log('Requesting new FatSecret access token...');
    
    // Request new token
    const tokenResponse = await fetch(FATSECRET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'basic',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get FatSecret token: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Cache the token with expiration time (subtract 60 seconds for safety margin)
    cachedToken = {
      ...tokenData,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000
    };
    
    console.log('Successfully obtained new FatSecret access token');
    return tokenData.access_token;
  } catch (error) {
    console.error('Error getting FatSecret access token:', error);
    throw error;
  }
}

/**
 * Search for food items in FatSecret database
 * @param {string} query Food name to search for
 * @param {number} maxResults Maximum number of results to return
 * @returns {Promise<Array>} Search results
 */
async function searchFoods(query, maxResults = 5) {
  try {
    if (!query) {
      throw new Error('Search query is required');
    }
    
    console.log(`Searching FatSecret for: "${query}"`);
    
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
      throw new Error(`Failed to search FatSecret: ${searchResponse.status} - ${errorText}`);
    }
    
    const searchData = await searchResponse.json();
    
    // Handle empty results
    if (!searchData.foods || !searchData.foods.food) {
      console.log(`No FatSecret results found for "${query}"`);
      return [];
    }
    
    // Handle single vs array results
    const foods = Array.isArray(searchData.foods.food) 
      ? searchData.foods.food 
      : [searchData.foods.food];
    
    console.log(`Found ${foods.length} FatSecret results for "${query}"`);
    return foods;
  } catch (error) {
    console.error(`Error searching FatSecret for "${query}":`, error);
    return [];
  }
}

/**
 * Get detailed food information by ID
 * @param {string} foodId FatSecret food ID
 * @returns {Promise<Object>} Food details
 */
async function getFoodDetails(foodId) {
  try {
    if (!foodId) {
      throw new Error('Food ID is required');
    }
    
    console.log(`Getting FatSecret food details for ID: ${foodId}`);
    
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
        format: 'json',
        include_sub_categories: 'true'
      })
    });
    
    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      throw new Error(`Failed to get FatSecret food details: ${detailsResponse.status} - ${errorText}`);
    }
    
    const detailsData = await detailsResponse.json();
    
    console.log(`Retrieved FatSecret details for food ID ${foodId}`);
    return detailsData.food;
  } catch (error) {
    console.error(`Error getting FatSecret food details for ID ${foodId}:`, error);
    throw error;
  }
}

/**
 * Convert FatSecret food data to standardized nutrition format
 * @param {Object} fatSecretFood Food data from FatSecret API
 * @returns {Object} Standardized nutrition data
 */
function standardizeNutritionData(fatSecretFood) {
  // Default empty nutrition object
  const nutrition = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
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
    nutrition.carbs = parseFloat(serving.carbohydrate) || 0;
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
    console.error('Error standardizing FatSecret nutrition data:', error);
    return nutrition;
  }
}

/**
 * Main function to handle command line arguments
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];
  
  if (!command) {
    console.log(`
Usage:
  node fatSecretClient.js search <food_name>
  node fatSecretClient.js details <food_id>
    `);
    return;
  }
  
  try {
    if (command === 'search' && param) {
      const searchResults = await searchFoods(param);
      console.log('\nSearch Results:');
      console.log(JSON.stringify(searchResults, null, 2));
      
      if (searchResults.length > 0) {
        // Show IDs for easier reference
        console.log('\nFood IDs for quick reference:');
        searchResults.forEach(food => {
          console.log(`${food.food_id}: ${food.food_name}`);
        });
        
        // If we have a valid first result, show nutritional data
        if (searchResults[0] && searchResults[0].food_id) {
          const foodDetails = await getFoodDetails(searchResults[0].food_id);
          const nutrition = standardizeNutritionData(foodDetails);
          console.log('\nNutritional Data for First Result:');
          console.log(JSON.stringify(nutrition, null, 2));
        }
      }
    } else if (command === 'details' && param) {
      const foodDetails = await getFoodDetails(param);
      console.log('\nFood Details:');
      console.log(JSON.stringify(foodDetails, null, 2));
      
      const nutrition = standardizeNutritionData(foodDetails);
      console.log('\nStandardized Nutrition Data:');
      console.log(JSON.stringify(nutrition, null, 2));
    } else {
      console.log('Invalid command or missing parameter');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}

// Export functions for external use
module.exports = {
  getAccessToken,
  searchFoods,
  getFoodDetails,
  standardizeNutritionData
};
