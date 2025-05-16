// Import Firebase modules - all imports at the top
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { onCall } = require("firebase-functions/v2/https");

// Initialize Firebase
admin.initializeApp();

// Import function modules
const authFunctions = require('./src/auth/auth');
const storageFunctions = require('./src/food/storage');
const foodFunctions = require('./src/food/detection');
const scansFunctions = require('./src/food/scans');
const fatSecretFunctions = require('./src/food/fatSecretSearch');
const app = require('./src/app');

// Export authentication functions
exports.createUserProfile = authFunctions.createUserProfile;
exports.updateUserProfile = authFunctions.updateUserProfile;
exports.getUserProfile = authFunctions.getUserProfile;

// Export functions
// Export functions
/**
 * Predicts blood glucose response based on meal nutritional content
 * Uses a simplified model based on carbohydrate, protein, and fat content
 */
exports.getGlucoseCurve = onCall({ enforceAppCheck: true, memory: "512MiB" }, async (request) => {
  const { data, auth } = request;
  const logger = require("firebase-functions/logger");
  
  // Ensure user is authenticated
  if (!auth) {
    logger.warn("Unauthenticated call to getGlucoseCurve");
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }
  
  try {
    let nutritionData;
    
    // If mealId is provided, fetch nutrition data from Firestore
    if (data?.mealId) {
      logger.info(`Fetching nutrition data for meal ID: ${data.mealId}`);
      let mealDoc = await admin.firestore().collection('meals')
        .doc(data.mealId).get();
      
      // If meal not found by ID, try to find the most recent meal for this user
      if (!mealDoc.exists && auth) {
        logger.info(`Meal not found with ID: ${data.mealId}. Trying to find recent meal for user: ${auth.uid}`);
        
        // Query most recent meal for this user
        const recentMealsQuery = await admin.firestore().collection('meals')
          .where('userId', '==', auth.uid)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
          
        if (!recentMealsQuery.empty) {
          mealDoc = recentMealsQuery.docs[0];
          logger.info(`Found recent meal with ID: ${mealDoc.id} for user ${auth.uid}`);
        }
      }
      
      if (!mealDoc.exists) {
        logger.warn(`Meal not found: ${data.mealId}`);
        // Instead of throwing an error, provide default values
        logger.info('Using default nutrition values for non-existent meal');
        nutritionData = {
          carbs: data?.defaultCarbs || 30,
          protein: data?.defaultProtein || 15, 
          fat: data?.defaultFat || 10,
          fiber: data?.defaultFiber || 2
        };
        // Return early from this branch
        const timePoints = [0, 15, 30, 45, 60, 90, 120, 150, 180];
        const curve = predictGlucoseResponse(
          nutritionData.carbs, 
          nutritionData.protein, 
          nutritionData.fat,
          timePoints,
          nutritionData.fiber
        );
        
        // Ensure data format is consistent for iOS app by creating individual data points
        const glucoseCurve = timePoints.map((time, index) => ({
          time: time,
          value: curve[index]
        }));
        
        return {
          success: true,
          glucoseCurve: glucoseCurve,
          nutritionData: {
            carbs: nutritionData.carbs,
            protein: nutritionData.protein,
            fat: nutritionData.fat,
            fiber: nutritionData.fiber
          },
          timePoints: timePoints,
          message: "Glucose prediction based on default nutritional values (meal not found)"
        };
      }
      
      const mealData = mealDoc.data();
      nutritionData = {
        carbs: mealData.nutrition?.carbohydrates?.value || 0,
        protein: mealData.nutrition?.protein?.value || 0,
        fat: mealData.nutrition?.fat?.value || 0,
        fiber: mealData.nutrition?.fiber?.value || 0
      };
      logger.info(`Retrieved nutrition data: ${JSON.stringify(nutritionData)}`);
    } else {
      // Use nutrition data passed directly
      nutritionData = {
        carbs: data?.carbs || 0,
        protein: data?.protein || 0,
        fat: data?.fat || 0,
        fiber: data?.fiber || 0
      };
      logger.info(`Using provided nutrition data: ${JSON.stringify(nutritionData)}`);
    }
    
    // Define time points (in minutes after meal)
    const timePoints = [0, 15, 30, 45, 60, 90, 120, 150, 180];
    
    // Generate glucose prediction
    const glucoseCurve = predictGlucoseResponse(
      nutritionData.carbs, 
      nutritionData.protein, 
      nutritionData.fat,
      timePoints,
      nutritionData.fiber
    );
    
    logger.info("Generated glucose curve for user: " + auth.uid);
    
    // IMPORTANT: Create clean, iOS-compatible data format with timeOffset field
    const curveDataPoints = [];
    for (let i = 0; i < timePoints.length; i++) {
      curveDataPoints.push({
        timeOffset: timePoints[i],  // Use timeOffset instead of time
        value: glucoseCurve[i]
      });
    }
    
    // Create a timestamp to avoid caching issues
    const timestamp = Date.now();
    
    // Create a clean response with minimal fields
    const response = {
      success: true,
      curveData: curveDataPoints,     // Primary field iOS app uses
      timestamp: timestamp,           // Add timestamp to avoid caching issues
      nutritionData: {
        carbs: nutritionData.carbs,
        protein: nutritionData.protein,
        fat: nutritionData.fat,
        fiber: nutritionData.fiber
      },
      message: "Glucose prediction based on meal nutritional content"
    };
    
    // Log the full response object for debugging
    console.log('Returning response from getGlucoseCurve:', JSON.stringify(response));
    
    return response;
  } catch (error) {
    logger.error("Error generating glucose curve:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Error generating glucose curve',
      error.message
    );
  }
});

/**
 * Predicts blood glucose response based on meal nutritional content
 * @param {number} carbs - Carbohydrates in grams
 * @param {number} protein - Protein in grams
 * @param {number} fat - Fat in grams
 * @param {Array<number>} timePoints - Array of time points in minutes
 * @param {number} fiber - Dietary fiber in grams (optional)
 * @return {Array<number>} Predicted glucose values at each time point
 */
function predictGlucoseResponse(carbs, protein, fat, timePoints, fiber = 0) {
  // Constants for the model
  const baselineGlucose = 85; // mg/dL - baseline glucose level
  
  // Retrieve fiber content from nutritionData if available
  if (typeof fiber !== 'number') {
    fiber = 0;
  }
  
  // Adjust glucose impact based on nutrition science
  // 1. Carbs have the highest direct impact on glucose
  const carbImpact = carbs * 3.5; 
  
  // 2. Protein has a moderate impact, but also slows absorption
  const proteinImpact = protein * 0.6;
  const proteinSlowingEffect = protein * 0.3;
  
  // 3. Fat significantly slows absorption and reduces peak
  const fatSlowingEffect = fat * 0.5;
  
  // 4. Fiber reduces glucose impact and slows absorption
  const fiberReduction = fiber * 0.8; // Fiber directly reduces effective carbs
  const fiberSlowingEffect = fiber * 0.4; // Fiber slows absorption
  
  // Calculate the total impact and modulation effects
  const netCarbImpact = Math.max(0, carbImpact - fiberReduction);
  const totalImpact = netCarbImpact + proteinImpact;
  
  // Calculate how much the peak is delayed and reduced by fat, protein, fiber
  const slowingEffect = fatSlowingEffect + proteinSlowingEffect + fiberSlowingEffect;
  
  // Calculate adjusted peak time - more fat/protein/fiber = later peak
  // Base peak time is 30-45 minutes for pure carbs, longer for mixed meals
  const basePeakTime = 30;
  const peakTimeModifier = slowingEffect * 0.5; // Each gram of slowing nutrient delays peak by 0.5 minutes
  const adjustedPeakTime = Math.min(basePeakTime + peakTimeModifier, 60); // Cap at 60 minutes
  
  // Reduce the overall peak based on the slowing effect
  // Higher fat/protein/fiber = lower peak glucose
  const peakReductionFactor = slowingEffect * 0.005; // Each gram reduces peak by 0.5%
  const peakReduction = 1 - Math.min(peakReductionFactor, 0.5); // Cap reduction at 50%
  
  // Calculate adjusted impact - high slowing nutrients = gentler curve
  const adjustedImpact = totalImpact * peakReduction;
  
  // Apply a maximum reasonable limit to avoid unrealistic predictions
  const cappedImpact = Math.min(adjustedImpact, 110);
  
  // If no nutritional impact, return flat baseline
  if (cappedImpact <= 0) {
    return timePoints.map(() => baselineGlucose);
  }
  
  // Adjust decay rate - more fat/protein/fiber = slower decay
  // This creates a longer, flatter curve as in real mixed meals
  const baseDecayRate = 0.7;
  const decayRateModifier = slowingEffect * 0.003; // Each gram slows decay slightly
  const adjustedDecayRate = Math.max(baseDecayRate - decayRateModifier, 0.3); // Lower bound on decay rate
  
  // Generate curve using the advanced model
  return timePoints.map(time => {
    // At time 0, we're at baseline
    if (time === 0) return baselineGlucose;
    
    let glucoseValue;
    if (time < adjustedPeakTime) {
      // Rising phase - modified power function for more realistic rise
      // Higher slowing effect = more gradual rise
      const riseProgress = time / adjustedPeakTime;
      const riseCurveShape = Math.max(1.0, 1.5 - (slowingEffect * 0.01)); // Adjust curve shape based on slowing nutrients
      glucoseValue = baselineGlucose + (cappedImpact * Math.pow(riseProgress, riseCurveShape));
    } else {
      // Falling phase - gradual decay back to baseline
      const timeSincePeak = time - adjustedPeakTime;
      const maxTime = Math.max(...timePoints) - adjustedPeakTime;
      const fallProgress = timeSincePeak / maxTime;
      
      // Adjusted exponential decay formula for more realistic fall
      // Higher fat/protein/fiber = more gradual fall
      glucoseValue = baselineGlucose + (cappedImpact * Math.exp(-adjustedDecayRate * fallProgress));
    }
    
    // Ensure we never go below baseline and round to integer
    return Math.max(Math.round(glucoseValue), baselineGlucose);
  });
}

// Export storage functions
exports.getUploadUrl = storageFunctions.getUploadUrl;
exports.processUploadedImage = storageFunctions.processUploadedImage;

// Export food detection functions
exports.analyzeFoodImage = foodFunctions.analyzeFoodImage;
exports.getFoodScanResult = foodFunctions.getFoodScanResult;

// Export FatSecret nutrition search functions
exports.searchFatSecretNutrition = fatSecretFunctions.searchFatSecretNutrition;
exports.getFatSecretFoodDetails = fatSecretFunctions.getFatSecretFoodDetails;

// Export the express app as a Firebase HTTPS function for API proxying
exports.app = functions.https.onRequest(app);
