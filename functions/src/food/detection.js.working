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
async function getVisionClient() {
  if (!visionClient) {
    try {
      // Initialize the Vision client using default credentials
      visionClient = new vision.ImageAnnotatorClient();
      logger.info('Vision API client initialized successfully using default credentials.');
    } catch (error) {
      // Log the detailed error if initialization fails
      logger.error('Failed to initialize Vision API client with default credentials:', error);
      // Re-throw the error to ensure the main function logic catches it
      throw error;
    }
  }
  return visionClient;
}

// Analyze food image
const { onCall } = require("firebase-functions/v2/https");

// Export the handler function implementation
async function analyzeFoodImageHandler(request) {
    console.log("analyzeFoodImage function called");

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
    
    // Process the image and return results
    try {
      // Extract image name from URL to use as meal ID (consistent with iOS app)
      let mealId;
      if (data.mealId) {
        mealId = data.mealId;
      } else {
        // Try to extract the image name from the URL which is typically a UUID
        // Extract filename from Firebase Storage URL
        const storageUrlPattern = /images%2F([\\w-]+)\\.(jpg|jpeg|png)/i;
        const match = imageUrl.match(storageUrlPattern);
        
        if (match && match[1]) {
          // Use the image filename without extension as mealId
          mealId = match[1];
          logger.info(`Extracted image filename as mealId: ${mealId}`);
        } else {
          // Fallback to Firestore generated ID
          mealId = admin.firestore().collection('meals').doc().id;
          logger.info(`Generated Firestore ID for mealId: ${mealId}`);
        }
      }
      
      // Return placeholder result for now to fix syntax
      return {
        success: true,
        mealId,
        mealName: "Food Item",
        ingredients: [],
        nutrition: {
          calories: 0,
          protein: 0,
          fat: 0,
          carbohydrates: 0,
          microNutrients: {
            fiber: 0,
            sugar: 0,
            sodium: 0,
            potassium: 0
          }
        },
        labels: [],
        barcodes: [],
        messages: ["Placeholder result for testing syntax fixes"]
      };
      
    } catch (error) {
      logger.error('Error in analyzeFoodImage:', error);
      throw new HttpsError('internal', `Error analyzing food image: ${error.message}`);
    }
}

// Export the handler function
exports.analyzeFoodImageHandler = analyzeFoodImageHandler;

// Export the wrapped function using onCall
exports.analyzeFoodImage = onCall(
  { enforceAppCheck: true, memory: "512MiB" },
  analyzeFoodImageHandler
);

// Export a placeholder getFoodScanResult function to maintain compatibility
exports.getFoodScanResult = onCall(
  {
    enforceAppCheck: true,
  },
  async (data, context) => {
    // Authentication check
    if (!context.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    
    // Placeholder implementation
    return {
      success: true,
      scan: {
        id: data.scanId || "placeholder-scan-id",
        timestamp: Timestamp.now(),
        items: []
      }
    };
  }
);
