/**
 * Standalone FatSecret Image Recognition API endpoint for NutriSnap
 * This module provides a dedicated function for using FatSecret's image recognition capabilities
 */
const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const fatSecretAPI = require('../utils/fatSecretAPI');
const admin = require('firebase-admin');

/**
 * Recognize food from an image using FatSecret's image recognition API
 * @param {string} imageUrl - URL of the image to analyze, or base64 image data
 * @param {string} region - Optional region code (e.g. 'GB', 'US')
 * @returns {Object} Detected food items with nutrition data
 */
exports.recognizeFoodFromImage = onCall(
  { 
    enforceAppCheck: true,
    memory: '512MiB' // Increase memory for image processing
  },
  async (request) => {
    // Standardize the parameter format for 2nd gen functions
    const { data, auth } = request;
    
    try {
      // Enforce authentication
      if (!auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'The function must be called while authenticated.'
        );
      }
      
      // Basic validation
      if (!data.imageUrl && !data.imageData) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing image URL or image data'
        );
      }

      // Generate a meal ID if not provided
      let mealId = data.mealId;
      if (!mealId) {
        // Try to extract image name from URL (this is a common pattern in the app)
        if (data.imageUrl) {
          const storageUrlPattern = /images%2F([\\w-]+)\\.(jpg|jpeg|png)/i;
          const match = data.imageUrl.match(storageUrlPattern);
          
          if (match && match[1]) {
            mealId = match[1];
            logger.info(`Extracted image filename as mealId: ${mealId}`);
          }
        }
        
        // Fallback to Firestore generated ID
        if (!mealId) {
          mealId = admin.firestore().collection('meals').doc().id;
          logger.info(`Generated Firestore ID for mealId: ${mealId}`);
        }
      }

      logger.info(`Starting FatSecret image recognition for user ${auth.uid}, mealId ${mealId}`);
      
      // Determine which parameter to use (imageUrl or imageData)
      const imageSource = data.imageUrl ? { imageUrl: data.imageUrl } : { imageData: data.imageData };
      
      // Set region (using GB as default for best English food detection)
      const options = {
        region: data.region || 'GB',
        language: data.language || 'en',
        includeFoodData: true
      };

      // Call the FatSecret API image recognition function
      const recognitionResults = await fatSecretAPI.recognizeFoodFromImage(imageSource, options);
      
      // Log results for debugging
      logger.info('Raw FatSecret response structure:', 
                 JSON.stringify(recognitionResults ? Object.keys(recognitionResults) : 'null'));
      
      // Extract detected food items
      const detectedFoods = [];
      
      if (recognitionResults && 
          recognitionResults.food_entries && 
          recognitionResults.food_entries.food) {
        // Handle both array and single object responses
        if (Array.isArray(recognitionResults.food_entries.food)) {
          detectedFoods.push(...recognitionResults.food_entries.food);
        } else {
          detectedFoods.push(recognitionResults.food_entries.food);
        }
      }

      // Log the detected food items
      logger.info(`FatSecret detected ${detectedFoods.length} food items:`, 
                  detectedFoods.map(food => food.food_name).join(', '));
      
      // Record the image and detection in Firestore
      try {
        const imageRecord = {
          userId: auth.uid,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          imageUrl: data.imageUrl || null,
          detectedFoods: detectedFoods.length,
          foodNames: detectedFoods.map(food => food.food_name)
        };
        
        const imageDocRef = await admin.firestore().collection('food_images').add(imageRecord);
        logger.info(`Created image record ${imageDocRef.id} for user ${auth.uid}`);
      } catch (error) {
        // Non-critical operation, just log the error
        logger.error('Error saving image recognition record:', error);
      }
      
      // Return the results
      if (detectedFoods.length > 0) {
        return {
          success: true,
          mealId,
          detectedFoods,
          message: `Successfully detected ${detectedFoods.length} food items in the image`
        };
      } else {
        return {
          success: false,
          mealId,
          detectedFoods: [],
          message: 'No food items detected in the image'
        };
      }
      
    } catch (error) {
      logger.error(`Error recognizing food from image:`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error processing image for food recognition',
        error.message
      );
    }
  }
);
