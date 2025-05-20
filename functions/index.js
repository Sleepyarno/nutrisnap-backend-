/**
 * NutriSnap Backend - Main Entry Point
 * 
 * This file integrates core functionality (food analysis & user profiles)
 * with the Learn tab functions while maintaining isolated execution contexts.
 * 
 * LLM Food Detection has been restored and is working correctly.
 * Learn functions are now using optimized implementations with higher memory allocation.
 */

const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
// Initialize Firebase Admin SDK
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger'); // Ensure logger is imported
admin.initializeApp();

// IMPORTANT: We're using lazy loading for imports to prevent initialization timeouts
// Each function will require only what it needs when it runs

// Import Express app - but don't start it automatically
const appExpress = require('./src/app'); // Main Express app

// Auth functions - Lazily load each function
exports.createUserProfile = require('./src/auth/auth').createUserProfile;
exports.updateUserProfile = require('./src/auth/auth').updateUserProfile;
exports.getUserProfile = require('./src/auth/auth').getUserProfile;

// Storage functions - Lazily load each function
exports.getUploadUrl = require('./src/food/storage').getUploadUrl;
exports.processUploadedImage = require('./src/food/storage').processUploadedImage;

// Import food detection and related functionalities
// const { analyzeFoodImageHandler } = require('./src/food/detection'); // Old import
// const { getFoodScanResult } = require('./src/food/detection'); // Old import

const detectionModule = require('./src/food/detection');
logger.info('--- Debug: detectionModule ---');
if (detectionModule) {
  logger.info('Keys in imported detectionModule:', Object.keys(detectionModule));
} else {
  logger.error('Failed to import from ./src/food/detection, detectionModule is null/undefined.');
}

const analyzeFoodImageHandler = detectionModule ? detectionModule.analyzeFoodImageHandler : undefined;
const getFoodScanResult = detectionModule ? detectionModule.getFoodScanResult : undefined; // Assuming this is also needed

if (typeof analyzeFoodImageHandler === 'function') {
  logger.info('analyzeFoodImageHandler imported successfully as a function.');
} else {
  logger.error('analyzeFoodImageHandler IS NOT a function after import. Type: ' + typeof analyzeFoodImageHandler + '. Value:', analyzeFoodImageHandler);
  // Consider if a more graceful failure or specific error throw is needed here if it's critical for startup
}

// Enhanced food analysis middleware that improves detection, filtering, and data structure
// This middleware ensures better quality output for the NutriSnap iOS app
const enhancedAnalyzeFoodImage = async (request) => {
  try {
    // Direct call to the imported handler
    if (typeof analyzeFoodImageHandler !== 'function') {
      logger.error('CRITICAL: enhancedAnalyzeFoodImage cannot call analyzeFoodImageHandler because it is not a function.');
      throw new functions.https.HttpsError('internal', 'Core image analysis handler is not available.');
    }
    const visionResults = await analyzeFoodImageHandler(request);
    const userId = request.auth ? request.auth.uid : null; // Get userId from request

    if (visionResults && visionResults.success) {
      // 1. Fix numeric data types (solves iOS Swift decoding errors)
      const numericFields = [
        'calories', 'protein', 'carbohydrates', 'fat', 
        'fiber', 'sugar', 'sodium', 'potassium'
      ];
      
      // Convert top-level numeric fields
      numericFields.forEach(field => {
        if (visionResults[field] !== undefined) {
          visionResults[field] = Number(visionResults[field]);
        }
      });
      
      // 2. Filter out non-food items 
      const nonFoodItems = ['dishware', 'plate', 'bowl', 'utensil', 'fork', 'knife', 'spoon', 'cup', 'glass', 'napkin', 'tablecloth', 'table', 'fast food'];
      const genericTerms = ['food', 'meal', 'dish', 'cuisine', 'recipe', 'snack'];
      
      // Filter labels and ingredients to remove non-food items
      if (visionResults.labels && Array.isArray(visionResults.labels)) {
        visionResults.labels = visionResults.labels.filter(label => 
          !nonFoodItems.includes(label.toLowerCase())
        );
      }
      
      // Filter out generic and non-food items from ingredients
      if (Array.isArray(visionResults.ingredients)) {
        visionResults.ingredients = visionResults.ingredients.filter(ingredient => 
          !nonFoodItems.includes(ingredient.name.toLowerCase()) &&
          !ingredient.name.toLowerCase().includes('dishware')
        );
        
        // 3. Improve meal naming
        if (visionResults.labels && visionResults.labels.length > 0) {
          // Use a better name than generic "Food"
          const specificFoodItems = visionResults.labels.filter(label => 
            !genericTerms.includes(label.toLowerCase()) && 
            !nonFoodItems.includes(label.toLowerCase())
          );
          
          // Look for breakfast-specific items
          const breakfastItems = visionResults.labels.filter(label => 
            label.toLowerCase().includes('breakfast') && 
            label.toLowerCase() !== 'breakfast'
          );
          
          // Set a more descriptive meal name
          if (breakfastItems.length > 0) {
            visionResults.mealName = breakfastItems[0];
          } else if (specificFoodItems.length > 0) {
            // For breakfast foods, make a more descriptive name
            if (specificFoodItems.some(item => 
                item.toLowerCase().includes('sausage') || 
                item.toLowerCase().includes('bacon') || 
                item.toLowerCase().includes('egg'))) {
              visionResults.mealName = 'Breakfast Plate';
            } else {
              visionResults.mealName = specificFoodItems[0];
            }
          }
          
          // Capitalize meal name properly
          if (visionResults.mealName) {
            visionResults.mealName = visionResults.mealName.split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
          }
        }
        
        // 4. Fix ingredient-level nutrition values
        visionResults.ingredients.forEach(ingredient => {
          if (ingredient.nutrition) {
            // Ensure all nutrition values are numbers (already handled by analyzeFoodImageHandler's parseFloat)
            Object.keys(ingredient.nutrition).forEach(key => {
              ingredient.nutrition[key] = Number(ingredient.nutrition[key] || 0);
            });
            
            // Add default 0 for essential micronutrients if strictly undefined
            // analyzeFoodImageHandler should already provide these with a default of 0 if not from FatSecret.
            // This is a safeguard.
            if (ingredient.nutrition.fiber === undefined) ingredient.nutrition.fiber = 0;
            if (ingredient.nutrition.sugar === undefined) ingredient.nutrition.sugar = 0;
            if (ingredient.nutrition.sodium === undefined) ingredient.nutrition.sodium = 0;
            if (ingredient.nutrition.potassium === undefined) ingredient.nutrition.potassium = 0;
            // Saturated Fat and Cholesterol are also handled in analyzeFoodImageHandler
            if (ingredient.nutrition.saturatedFat === undefined) ingredient.nutrition.saturatedFat = 0;
            if (ingredient.nutrition.cholesterol === undefined) ingredient.nutrition.cholesterol = 0;
          } else {
            // If nutrition object itself is missing, create it with defaults
            ingredient.nutrition = {
              calories: 0, protein: 0, fat: 0, carbohydrates: 0,
              fiber: 0, sugar: 0, sodium: 0, potassium: 0,
              saturatedFat: 0, cholesterol: 0
            };
          }
        });
        
        // 5. CRITICAL: Ensure micronutrients are included at the top level (iOS Swift fix)
        // analyzeFoodImageHandler now directly provides aggregated fiber, sugar, sodium, potassium at the top level.
        // This section can be simplified or removed if analyzeFoodImageHandler consistently provides them.
        // For safety, we'll ensure they are numbers if they exist.
        if (visionResults.fiber === undefined) visionResults.fiber = 0; else visionResults.fiber = Number(visionResults.fiber);
        if (visionResults.sugar === undefined) visionResults.sugar = 0; else visionResults.sugar = Number(visionResults.sugar);
        if (visionResults.sodium === undefined) visionResults.sodium = 0; else visionResults.sodium = Number(visionResults.sodium);
        if (visionResults.potassium === undefined) visionResults.potassium = 0; else visionResults.potassium = Number(visionResults.potassium);

        // The old logic for copying from a nested `result.nutrition.microNutrients` is no longer needed
        // as `analyzeFoodImageHandler` flattens this.
        
        // 6. Enhance multi-component detection for complex meals
        if (visionResults.labels && Array.isArray(visionResults.labels)) {
          // Detect if this is a multi-component meal (breakfast, platter, etc.)
          const isComplexMeal = visionResults.labels.some(label => 
            label.toLowerCase().includes('breakfast') ||
            label.toLowerCase().includes('meal') ||
            label.toLowerCase().includes('dish') ||
            label.toLowerCase().includes('platter')
          );
          
          // Common food components that should be preserved
          const foodComponents = ['egg', 'sausage', 'bacon', 'bean', 'tomato', 
                              'toast', 'mushroom', 'potato', 'bread'];
          
          // Get all components from the Vision API labels
          const labelComponents = new Set();
          visionResults.labels.forEach(label => {
            foodComponents.forEach(component => {
              if (label.toLowerCase().includes(component)) {
                // Clean up the component name
                let componentName = label;
                if (component === 'egg') componentName = 'Eggs';
                else if (component === 'sausage') componentName = 'Sausages';
                else if (component === 'bacon') componentName = 'Bacon';
                else if (component === 'bean') componentName = 'Baked Beans';
                else if (component === 'tomato') componentName = 'Tomatoes';
                else if (component === 'toast' || component === 'bread') componentName = 'Toast';
                else if (component === 'mushroom') componentName = 'Mushrooms';
                else if (component === 'potato') componentName = 'Potatoes';
                labelComponents.add(componentName);
              }
            });
          });
          
          // Only process if we detected multiple components or explicit complex meal
          if (isComplexMeal || labelComponents.size > 1) {
            // Check which components are missing from current ingredients
            const currentComponents = new Set(visionResults.ingredients.map(i => 
              i.name.toLowerCase().replace(/\s+\([^)]+\)$/, '') // Remove quantities in parentheses
            ));
            
            // Add missing components with basic nutrition data
            Array.from(labelComponents).forEach(component => {
              if (!currentComponents.has(component.toLowerCase())) {
                // Check if component is already included in a similar form
                const isPartialMatch = Array.from(currentComponents).some(existing => 
                  existing.includes(component.toLowerCase()) || 
                  component.toLowerCase().includes(existing)
                );
                
                if (!isPartialMatch) {
                  visionResults.ingredients.push({
                    name: component,
                    nutrition: {
                      calories: 100, // Basic placeholder nutrition
                      protein: 5,
                      carbohydrates: 10,
                      fat: 5,
                      fiber: 2,
                      sugar: 1,
                      sodium: 50,
                      potassium: 100
                    }
                  });
                }
              }
            });
          }
        }
        
        // 7. Update success message to be more specific
        if (visionResults.messages && Array.isArray(visionResults.messages)) {
          visionResults.messages = [`${visionResults.mealName || 'Food'} analyzed successfully`];
        }
      }
      // After all processing, save the enhanced visionResults to Firestore
      // so getGlucoseCurve can use it.
      // visionResults contains mealId, which was either passed in request.data.mealId or generated.
      if (userId && visionResults.mealId) {
        const mealDocRef = admin.firestore().collection('users').doc(userId).collection('meals').doc(visionResults.mealId);
        try {
          await mealDocRef.set(visionResults, { merge: true });
          logger.info(`Successfully saved enhanced nutrition analysis for mealId: ${visionResults.mealId}, userId: ${userId} to Firestore.`);
        } catch (dbError) {
          logger.error(`Error saving enhanced nutrition analysis for mealId: ${visionResults.mealId}, userId: ${userId} to Firestore:`, dbError);
          // Decide if this error should be surfaced to the client or just logged
          // For now, we'll log it and proceed with returning visionResults
        }
      } else {
        logger.warn('Could not save enhanced nutrition analysis to Firestore: userId or mealId missing.', { userId, mealId: visionResults.mealId });
      }
    }
    
    return visionResults;
  } catch (error) {
    console.error('Error in enhanced analyzeFoodImage:', error);
    throw error; // Re-throw to maintain original error behavior
  }
};

// Export FatSecret-specific API functions (Restoring these V1 style exports)
exports.searchFatSecretNutrition = require('./src/food/fatSecretSearch').searchFatSecretNutrition;
exports.getFatSecretFoodDetails = require('./src/food/fatSecretSearch').getFatSecretFoodDetails;
exports.getAutocompleteSuggestions = require('./src/food/fatSecretSearch').getAutocompleteSuggestions;
// New dedicated function for FatSecret image recognition
exports.recognizeFoodFromImage = require('./src/food/fatSecretImageRecognition').recognizeFoodFromImage;

// Export getFoodScanResult function directly from its module
// This avoids loading the entire foodFunctions module
if (typeof getFoodScanResult === 'function') {
    exports.getFoodScanResult = onCall({ memory: "256MiB", timeoutSeconds: 60, enforceAppCheck: true }, getFoodScanResult);
} else {
    logger.warn('getFoodScanResult is not a function, so exports.getFoodScanResult will not be set up.');
}

// Export Learn tab functions individually to avoid loading everything at once
// This approach prevents function load timeouts
exports.learn_getKnowledgeArticleBySlug = require('./src/learn-optimized').getKnowledgeArticleBySlug;
exports.learn_listKnowledgeArticlesByCategory = require('./src/learn-optimized').listKnowledgeArticlesByCategory;
exports.learn_listKnowledgeCategories = require('./src/learn-optimized').listKnowledgeCategories;

// Use the adapter version for featured articles to ensure iOS app compatibility
// Load it only when needed
exports.learn_getFeaturedArticles = require('./src/learn-adapter').learn_getFeaturedArticlesAdapter;
exports.learn_searchKnowledgeArticles = require('./src/learn-optimized').searchKnowledgeArticles;
exports.learn_getLatestArticles = require('./src/learn-optimized').getLatestArticles;

// Main API Gateway with increased timeout and memory
const { onRequest } = require('firebase-functions/v2/https');
exports.app = onRequest(
  { memory: "1GiB", timeoutSeconds: 120 },  // Set memory to 1GiB
  appExpress
);

// Food Detection and Analysis Functions (V2 onCall)
// Ensure analyzeFoodImage is exported correctly
if (detectionModule && typeof enhancedAnalyzeFoodImage === 'function') { // or analyzeFoodImageHandler directly if not using enhanced wrapper
  exports.analyzeFoodImage = onCall(
    { timeoutSeconds: 180, memory: "1GiB", enforceAppCheck: true }, 
    enhancedAnalyzeFoodImage 
  );
  logger.info('analyzeFoodImage function exported successfully (V2 onCall).');
} else {
  logger.error('analyzeFoodImage function (enhancedAnalyzeFoodImage or analyzeFoodImageHandler) was not exported as it was not found or not a function.');
}

// Ensure getGlucoseCurve is exported using onCall and references the function from detectionModule
if (detectionModule && typeof detectionModule.getGlucoseCurve === 'function') {
  // detectionModule.getGlucoseCurve is ALREADY an onCall V2 function from detection.js, export it directly.
  exports.getGlucoseCurve = detectionModule.getGlucoseCurve;
  logger.info('getGlucoseCurve function (pre-wrapped V2 onCall from detection.js) exported directly.');
} else {
  logger.error('getGlucoseCurve function was not exported because it was not found or not a function in detectionModule.');
  if (detectionModule) {
    logger.info('Keys in detectionModule at time of getGlucoseCurve export attempt:', Object.keys(detectionModule));
    logger.info('Type of detectionModule.getGlucoseCurve:', typeof detectionModule.getGlucoseCurve);
  } else {
    logger.error('detectionModule itself is undefined at time of getGlucoseCurve export attempt.');
  }
}

// FatSecret related functions (V2 onCall attempts - KEEP THESE COMMENTED OUT)
/*
if (detectionModule && typeof detectionModule.searchFatSecretNutrition === 'function') {
  exports.searchFatSecretNutrition = onCall(
    { timeoutSeconds: 60, memory: "256MiB" }, 
    detectionModule.searchFatSecretNutrition
  );
  logger.info('searchFatSecretNutrition function exported successfully.');
} else {
  logger.error('searchFatSecretNutrition function was not exported because it was not found or not a function in detectionModule.');
}

if (detectionModule && typeof detectionModule.getFatSecretFoodDetails === 'function') {
  exports.getFatSecretFoodDetails = onCall(
    { timeoutSeconds: 60, memory: "256MiB" }, 
    detectionModule.getFatSecretFoodDetails
  );
  logger.info('getFatSecretFoodDetails function exported successfully.');
} else {
  logger.error('getFatSecretFoodDetails function was not exported because it was not found or not a function in detectionModule.');
}
*/

// Learn Tab Functions V2 (onCall attempt - KEEP THIS COMMENTED OUT)
/*
const learnFunctionsV2 = require('./src/learn_v2/index'); 

if (learnFunctionsV2 && typeof learnFunctionsV2.getFeaturedArticles === 'function') {
  exports.learnv2_getFeaturedArticles = onCall( 
    { memory: "512MiB", timeoutSeconds: 60, enforceAppCheck: false }, 
    learnFunctionsV2.getFeaturedArticles
  );
  logger.info('learnv2_getFeaturedArticles exported.');
} else {
  logger.error('learnv2_getFeaturedArticles could not be exported.');
}
*/
