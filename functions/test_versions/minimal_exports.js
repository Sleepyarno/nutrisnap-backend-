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
const { enhanceFoodDetection } = require('./llmEnhancer'); // Import LLM enhancer
const apiUtils = require('../utils/apiUtils'); // Import API utilities
const fatSecretAPI = require('../utils/fatSecretAPI'); // Import FatSecret API utilities

// Initialize Vision API client with default credentials


let visionClient = null;

// Minimal function implementation 
async function analyzeFoodImageHandler(request) {
  const { data, auth } = request;
  if (!auth) {
    throw new Error('Not authenticated');
  }
  return { success: true };
}

exports.analyzeFoodImageHandler = analyzeFoodImageHandler;

// Export the wrapped function using onCall
exports.analyzeFoodImage = onCall(
  { enforceAppCheck: true, memory: "512MiB" },
  analyzeFoodImageHandler
);

// Get food scan result
// Function to classify a meal based on detected ingredients and labels
function classifyMeal(ingredients, labels) {
  // Convert all inputs to lowercase for case-insensitive matching
  const ingredientNames = ingredients.map(i => i.name.toLowerCase());
  const labelsList = labels.map(l => l.toLowerCase());
  
  // Common meal patterns
  const mealPatterns = [
    {
      name: "English Breakfast",
      keywords: ["breakfast", "full breakfast", "english breakfast", "fry up", "full english", "morning meal", "brunch"],
      requiredItems: ["sausage", "sausages", "egg", "eggs", "bean", "beans", "baked beans", "bacon", "ham", "mushroom", "mushrooms", "tomato", "tomatoes", "toast", "bread", "hash brown", "hash browns", "potato", "breakfast link", "black pudding"],
      requireCount: 1 // Lower the threshold to 1 to better detect English breakfast with fewer components
    },
    {
      name: "Pizza",
      keywords: ["pizza"],
      requiredItems: ["pizza", "cheese", "tomato"],
      requireCount: 1
    },
    {
      name: "Salad",
      keywords: ["salad"],
      requiredItems: ["lettuce", "salad", "vegetable"],
      requireCount: 1
    },
    {
      name: "Pasta Dish",
      keywords: ["pasta", "spaghetti", "noodle"],
      requiredItems: ["pasta", "spaghetti", "noodle"],
      requireCount: 1
    },
    {
      name: "Stir Fry",
      keywords: ["stir fry", "chinese", "asian"],
      requiredItems: ["rice", "noodle", "vegetable"],
      requireCount: 1
    },
    {
      name: "Burger and Fries",
      keywords: ["burger", "hamburger"],
      requiredItems: ["burger", "bun", "patty", "fries"],
      requireCount: 1
    },
    {
      name: "Dessert",
      keywords: ["dessert", "cake", "ice cream", "sweet", "chocolate"],
      requiredItems: ["sugar", "chocolate", "cream", "dessert", "cake"],
      requireCount: 1
    }
  ];

  // Check for each meal pattern
  for (const pattern of mealPatterns) {
    // Check if any keywords match in labels
    const keywordMatch = pattern.keywords.some(keyword => 
      labelsList.some(label => label.includes(keyword))
    );
    
    // Count how many required items are present in ingredient names
    // Using a more flexible matching approach
    const requiredItemsPresent = pattern.requiredItems.filter(item => 
      ingredientNames.some(name => {
        // For English breakfast specifically, do more flexible matching
        if (pattern.name === "English Breakfast") {
          // Check for plurals and variations
          return name.includes(item) || 
                 (item.endsWith('s') && name.includes(item.slice(0, -1))) || 
                 (item === 'egg' && name.includes('eggs')) ||
                 (item === 'bean' && name.includes('beans'));
        }
        return name.includes(item);
      })
    ).length;
    
    // If we have keyword match AND enough required items
    if (keywordMatch && requiredItemsPresent >= pattern.requireCount) {
      logger.info(`Meal classified as ${pattern.name}. Matched ${requiredItemsPresent} required items.`);
      return pattern.name;
    }
  }
  
  // If no pattern matches, return null (will use default approach)
  return null;
}

exports.getFoodScanResult = onCall(
  {
    enforceAppCheck: true, // Enforce App Check (Recommended)
  },
  async (data, context) => {
    // --- Add Logging Here ---
    logger.info("getFoodScanResult called.");
    logger.info("Function context app:", context.app);   // Log App Check context
    logger.info("Function context auth:", context.auth); // Log Auth context
    logger.info("Received data:", data);
    // --- End Logging ---

    // App Check verification happens before this point due to enforceAppCheck: true

    if (!context.auth) {
      logger.error("Authentication check failed in getFoodScanResult: context.auth is null or undefined.");
      throw new HttpsError('unauthenticated', 'User must be authenticated to get scan results.');
    }

    const userId = context.auth.uid;
    const { scanId } = data;

    if (!scanId) {
      logger.warn("Missing scanId in getFoodScanResult request.", { userId: userId });
      throw new HttpsError('invalid-argument', 'Scan ID is required');
    }

    try {
      logger.info(`Fetching scan result for ID: ${scanId}`, { userId: userId });
      const scanDoc = await admin.firestore().collection('users').doc(userId)
        .collection('scans').doc(scanId).get();

      if (!scanDoc.exists) {
        logger.warn(`Scan document not found for ID: ${scanId}`, { userId: userId });
        throw new HttpsError('not-found', `Scan with ID ${scanId} not found.`);
      }

      logger.info(`Successfully retrieved scan document for ID: ${scanId}`, { userId: userId });
      return scanDoc.data(); // Return the scan data

    } catch (error) {
      logger.error(`Error getting food scan result for ID: ${scanId}`, {
          errorMessage: error.message,
          errorStack: error.stack,
          userId: userId
      });
