/**
 * Standalone FatSecret API Functions for NutriSnap
 * 
 * This file provides isolated Cloud Functions for FatSecret API integration without
 * dependencies on problematic detection.js file.
 */

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');
// Check if already initialized, if not initialize with default app
try {
  admin.instanceId();
} catch (e) {
  admin.initializeApp();
}

// Export the specific FatSecret API functions
exports.recognizeFoodFromImage = require('./src/food/fatSecretImageRecognition').recognizeFoodFromImage;
exports.searchFatSecretNutrition = require('./src/food/fatSecretSearch').searchFatSecretNutrition;
exports.getFatSecretFoodDetails = require('./src/food/fatSecretSearch').getFatSecretFoodDetails;
exports.getAutocompleteSuggestions = require('./src/food/fatSecretSearch').getAutocompleteSuggestions;
