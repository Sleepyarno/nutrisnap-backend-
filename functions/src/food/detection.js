/* eslint-env node */
// NutriSnap backend now uses both Open Food Facts and USDA FoodData Central API for nutrition data.
//
// USDA API KEY MANAGEMENT:
// - For local development, use a . with USDA_API_KEY=your_key and ensure dotenv is loaded.
// - For production (Firebase Cloud Functions), use: firebase functions:config:set usda.api_key="your_key"
//   The code will automatically use the right key for each environment.

// Load .env for local dev
try { require('dotenv').config(); } catch (e) { /* ignore if dotenv not installed */ }

const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const vision = require('@google-cloud/vision');
const { Timestamp } = require('firebase-admin/firestore');
const logger = require("firebase-functions/logger"); // Import the logger
const sharp = require('sharp'); // Import sharp
const { enhanceFoodDetection } = require('./llmEnhancer'); // Import LLM enhancer
const apiUtils = require('../utils/apiUtils'); // Import API utilities
const fatSecretAPI = require('../utils/fatSecretAPI'); // Import FatSecret API utilities

// Initialize Vision API client with default credentials


let visionClient = null; // We will remove Google Vision
// async function getVisionClient() { ... } // This function will be removed

// Analyze food image
const { onCall } = require("firebase-functions/v2/https");

// Export the handler function implementation first
async function analyzeFoodImageHandler(request) {
    console.log("analyzeFoodImage function called - NOW USING FATSECRET IMAGE RECOGNITION");

    // Destructure data and auth from request (2nd-gen signature)
    const { data, auth } = request;
    console.log("Auth present:", !!auth);
    console.log("Data contains image URL:", !!data?.imageUrl);

    // Enforce authentication via Firebase Auth
    if (!auth) {
      console.error("No authentication provided to analyzeFoodImage");
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    console.log("User is authenticated via Firebase Auth:", auth.uid);

    // The image URL is required
    const imageUrl = data.imageUrl;
    if (!imageUrl) {
      throw new HttpsError(
        'invalid-argument',
        'Missing image URL'
      );
    }
    
    let mealId;
    if (data.mealId) {
      mealId = data.mealId;
    } else {
      const storageUrlPattern = /images%2F([\w-]+)\.(jpg|jpeg|png)/i;
      const match = imageUrl.match(storageUrlPattern);
      if (match && match[1]) {
        mealId = match[1];
        logger.info(`Extracted image filename as mealId: ${mealId}`);
      } else {
        mealId = admin.firestore().collection('meals').doc().id;
        logger.info(`Generated Firestore ID for mealId: ${mealId}`);
      }
    }

    logger.info("Starting FatSecret image analysis for imageUrl: " + imageUrl, { userId: auth.uid, mealId });

    try {
      const fetch = require('node-fetch');
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new HttpsError('invalid-argument', `Unable to download image from ${imageUrl}. Status: ${imageResponse.status}`);
      }

      // New way: Resize with sharp then get buffer
      const resizedImageBuffer = await sharp(await imageResponse.buffer()) // Pass buffer to sharp
        .resize({ 
          width: 512, 
          height: 512, 
          fit: 'inside', // Preserves aspect ratio, fits within 512x512
          withoutEnlargement: true // Don't enlarge if image is already smaller
        })
        .jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
        .toBuffer();

      const base64ImageString = resizedImageBuffer.toString('base64');

      logger.info(`Resized image downloaded and converted to Base64. New size: ${base64ImageString.length} chars.`);

      // Call FatSecret Image Recognition
      // The fatSecretAPI.recognizeFoodFromImage is expected to be in ../utils/fatSecretAPI.js
      // and should handle token acquisition with 'image-recognition' scope.
      const fatSecretResult = await fatSecretAPI.recognizeFoodFromImage(base64ImageString);

      if (!fatSecretResult || (!fatSecretResult.foods && !fatSecretResult.food_response)) {
        logger.warn('FatSecret image recognition result (raw JSON): ' + JSON.stringify(fatSecretResult, null, 2));
        // Return a structure indicating no results, compatible with enhancedAnalyzeFoodImage
        return {
          success: true, // Or false, depending on how you want to handle "no foods found"
          message: 'No food items recognized by FatSecret.',
          labels: [],
          ingredients: [],
          mealName: 'Unknown Meal',
          calories: 0, protein: 0, fat: 0, carbohydrates: 0,
          source: 'FatSecret Image Recognition',
          mealId: mealId,
          timestamp: Timestamp.now(),
          // Ensure basic micro-nutrients are present for downstream compatibility
          fiber: 0, sugar: 0, sodium: 0, potassium: 0,
        };
      }
      
      // FatSecret API guide (Section 2.1) suggests a `foods` array.
      // The more detailed examples later show `food_response`. We'll try `foods` first.
      let recognizedFoods = fatSecretResult.foods;
      if (!recognizedFoods && fatSecretResult.food_response) {
        // The detailed example structure is an array under food_response
        // Each item has food_id, food_entry_name, eaten (with total_nutritional_content), suggested_serving
        // If include_food_data was true, it might also have a 'food' object with 'servings'
        logger.info('Using food_response structure from FatSecret.');
        recognizedFoods = fatSecretResult.food_response.map(item => {
          // Attempt to normalize this structure to look like the simpler `foods` array structure
          // where nutrition is directly available or within a nested 'nutrition' or 'total_nutritional_content'
          let nutritionData = {};
          if (item.food && item.food.servings && item.food.servings.serving) {
             // If full 'food' object with 'servings' is present (due to include_food_data=true)
             // Use the first serving's nutrition data.
             const serving = Array.isArray(item.food.servings.serving) ? item.food.servings.serving[0] : item.food.servings.serving;
             nutritionData = {
                calories: parseFloat(serving.calories) || 0,
                protein: parseFloat(serving.protein) || 0,
                fat: parseFloat(serving.fat) || 0,
                carbohydrate: parseFloat(serving.carbohydrate) || 0,
                fiber: parseFloat(serving.fiber) || 0,
                sugar: parseFloat(serving.sugar) || 0,
                sodium: parseFloat(serving.sodium) || 0,
                potassium: parseFloat(serving.potassium) || 0,
                saturated_fat: parseFloat(serving.saturated_fat) || 0,
                cholesterol: parseFloat(serving.cholesterol) || 0,
                // Add other micros if available and needed by your app
             };
          } else if (item.eaten && item.eaten.total_nutritional_content) {
            // Fallback to 'eaten.total_nutritional_content'
            const eatenNutrition = item.eaten.total_nutritional_content;
            nutritionData = {
                calories: parseFloat(eatenNutrition.calories) || 0,
                protein: parseFloat(eatenNutrition.protein) || 0,
                fat: parseFloat(eatenNutrition.fat) || 0,
                carbohydrate: parseFloat(eatenNutrition.carbohydrate) || 0,
                fiber: parseFloat(eatenNutrition.fiber) || 0,
                sugar: parseFloat(eatenNutrition.sugar) || 0,
                sodium: parseFloat(eatenNutrition.sodium) || 0,
                potassium: parseFloat(eatenNutrition.potassium) || 0,
                saturated_fat: parseFloat(eatenNutrition.saturated_fat) || 0,
                cholesterol: parseFloat(eatenNutrition.cholesterol) || 0,
            };
          }
          return {
            food_id: item.food_id,
            food_name: item.food_entry_name || (item.food ? item.food.food_name : 'Unknown Food'),
            probability: item.probability || 1.0, // Add a default probability if not present
            serving_id: (item.suggested_serving ? item.suggested_serving.serving_id : null) || (item.food && item.food.servings && item.food.servings.serving ? (Array.isArray(item.food.servings.serving) ? item.food.servings.serving[0].serving_id : item.food.servings.serving.serving_id) : null),
            nutrition: nutritionData,
          };
        });
      }


      if (!recognizedFoods || recognizedFoods.length === 0) {
        logger.info('No food items recognized by FatSecret image recognition.');
        return { 
          success: true, // Still success, just no items found
          message: 'No food items recognized by FatSecret.', 
          labels: [], 
          ingredients: [], 
          mealName: 'Unknown Meal',
          calories: 0, protein: 0, fat: 0, carbohydrates: 0,
          source: 'FatSecret Image Recognition',
          mealId: mealId,
          timestamp: Timestamp.now(),
          fiber: 0, sugar: 0, sodium: 0, potassium: 0,
        };
      }

      logger.info(`FatSecret recognized ${recognizedFoods.length} food items.`);

      const ingredients = [];
      const labels = [];
      let totalCalories = 0;
      let totalProtein = 0;
      let totalFat = 0;
      let totalCarbs = 0;
      let totalFiber = 0;
      let totalSugar = 0;
      let totalSodium = 0;
      let totalPotassium = 0;

      recognizedFoods.forEach(food => {
        // The 'nutrition' object should be directly available if include_food_data was true
        // and FatSecret returned the simpler `foods` array structure.
        // If we normalized from `food_response`, it's also in `food.nutrition`.
        const nutrition = food.nutrition || {};
        
        // Fallback for structure where nutrition might be nested differently or incomplete
        const currentCalories = parseFloat(nutrition.calories) || 0;
        const currentProtein = parseFloat(nutrition.protein) || 0;
        const currentFat = parseFloat(nutrition.fat) || 0;
        const currentCarbs = parseFloat(nutrition.carbohydrate || nutrition.carbohydrates) || 0; // Handle both spellings
        const currentFiber = parseFloat(nutrition.fiber) || 0;
        const currentSugar = parseFloat(nutrition.sugar) || 0;
        const currentSodium = parseFloat(nutrition.sodium) || 0;
        const currentPotassium = parseFloat(nutrition.potassium) || 0;
        
        const ingredientName = food.food_name || 'Unknown Food Item';
        labels.push(ingredientName);

        ingredients.push({
          name: ingredientName,
          foodId: food.food_id,
          servingId: food.serving_id, // FatSecret might provide this
          probability: food.probability, // FatSecret provides probability
          nutrition: {
            calories: currentCalories,
            protein: currentProtein,
            fat: currentFat,
            carbohydrates: currentCarbs,
            fiber: currentFiber,
            sugar: currentSugar,
            sodium: currentSodium,
            potassium: currentPotassium,
            // Add other micros if FatSecret provides them and your app needs them
            // e.g., saturated_fat, cholesterol from the normalization step
            saturatedFat: parseFloat(nutrition.saturated_fat || nutrition.saturatedFat) || 0,
            cholesterol: parseFloat(nutrition.cholesterol) || 0,
          },
          source: 'FatSecret Image Recognition'
        });

        totalCalories += currentCalories;
        totalProtein += currentProtein;
        totalFat += currentFat;
        totalCarbs += currentCarbs;
        totalFiber += currentFiber;
        totalSugar += currentSugar;
        totalSodium += currentSodium;
        totalPotassium += currentPotassium;
      });

      // Determine meal name (can be refined in enhancedAnalyzeFoodImage)
      let mealName = labels.length > 0 ? labels.join(', ') : 'Recognized Meal';
      if (mealName.length > 100) mealName = labels[0] || 'Recognized Meal'; // Keep it concise

      const result = {
        success: true,
        message: `Successfully recognized ${ingredients.length} food items using FatSecret.`,
        labels: labels,
        ingredients: ingredients,
        mealName: mealName,
        calories: parseFloat(totalCalories.toFixed(2)),
        protein: parseFloat(totalProtein.toFixed(2)),
        fat: parseFloat(totalFat.toFixed(2)),
        carbohydrates: parseFloat(totalCarbs.toFixed(2)),
        // Include aggregated micronutrients at the top level for compatibility
        fiber: parseFloat(totalFiber.toFixed(2)),
        sugar: parseFloat(totalSugar.toFixed(2)),
        sodium: parseFloat(totalSodium.toFixed(2)),
        potassium: parseFloat(totalPotassium.toFixed(2)),
        source: 'FatSecret Image Recognition',
        mealId: mealId,
        timestamp: Timestamp.now(),
        // Include raw FatSecret response for potential debugging or advanced use in enhancedAnalyzeFoodImage
        // fatSecretRawResponse: fatSecretResult 
      };
      
      logger.info('Result from analyzeFoodImageHandler (FatSecret):', result);
      // The `enhancedAnalyzeFoodImage` function will further process this.
      return result;

    } catch (error) {
      logger.error('Error in analyzeFoodImageHandler with FatSecret:', error);
      // Ensure a consistent error structure or rethrow HttpsError
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Image analysis failed: ${error.message}`, error);
    }
}

// No longer need these specific nutrition fetching functions here if FatSecret provides all data
// async function getNutritionFromOFF(foodLabel) { ... } // REMOVE
// async function getNutritionFromUSDA(foodLabel) { ... } // REMOVE
// The text-based fatSecretAPI.getNutritionFromFatSecret(label) was also here, implicitly removed by changing the main logic flow.

// Helper functions like classifyMeal, getReferenceNutritionData, calculateNutritionFromIngredients, getNutritionData
// might need to be removed or significantly adapted if they are no longer relevant with FatSecret's direct output.
// For now, we are removing the direct calls to them from the main path.
// If `enhancedAnalyzeFoodImage` relies on them, they might need to be called there,
// or their logic incorporated into how FatSecret's response is processed.

// The following functions are likely NO LONGER NEEDED here as FatSecret image recognition should provide data directly.
// They are based on processing labels from Google Vision.
// function classifyMeal(ingredients, labels) { ... }
// function getReferenceNutritionData(detectedIngredients, labels) { ... }
// function calculateNutritionFromIngredients(detectedIngredients, labels) { ... }
// async function getNutritionData(foodItems) { ... } // This was a wrapper for USDA/OFF lookups

// Add this export if other modules need to call analyzeFoodImageHandler directly
exports.analyzeFoodImageHandler = analyzeFoodImageHandler; // Corrected export name

// Export the callable function, now pointing to our refactored handler
// This name 'analyzeFoodImage' is what the client calls.
// The 'enhancedAnalyzeFoodImage' in index.js wraps this.
exports.analyzeFoodImage = onCall(
  { enforceAppCheck: true, memory: "512MiB" }, // Ensure options are consistent
  analyzeFoodImageHandler
);


// --- Potentially keep or adapt if needed for fallback or other purposes ---
// The original file had getNutritionFromOFF, getNutritionFromUSDA, and other helpers.
// For this focused change to FatSecret Image Rec, we are removing their direct usage
// in the main image analysis flow. If fallbacks are desired, they'd need to be re-integrated carefully.

// Example of where the old API calls were:
// const [usdaNutrition, offNutrition, fatSecretNutrition] = await Promise.race([...]);
// This block is now replaced by the single call to fatSecretAPI.recognizeFoodFromImage
// and processing its direct output.
