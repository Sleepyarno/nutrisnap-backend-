/**
 * NutriSnap Backend - Alternative Entry Point for FatSecret Functions
 * 
 * This file provides isolated FatSecret functions that can be deployed
 * independently of other potentially problematic files in the codebase.
 */

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');

try {
  admin.instanceId();
} catch (e) {
  admin.initializeApp();
}

// Import FatSecret standalone functions
const { recognizeFoodFromImage } = require('./src/food/fatSecretImageRecognition');
const { 
  searchFatSecretNutrition,
  getFatSecretFoodDetails,
  getAutocompleteSuggestions
} = require('./src/food/fatSecretSearch');

// Export the standalone FatSecret API functions
exports.recognizeFoodFromImage = recognizeFoodFromImage;
exports.searchFatSecretNutrition = searchFatSecretNutrition;
exports.getFatSecretFoodDetails = getFatSecretFoodDetails;
exports.getAutocompleteSuggestions = getAutocompleteSuggestions;
