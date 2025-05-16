/* eslint-env node */
// Glucose API Endpoints
// Provides direct endpoints for glucose curve data generation

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { generateGlucoseCurve } = require('./glucoseService');

/**
 * Generate glucose curve data for a meal
 * This endpoint allows the frontend to get glucose curve data directly
 * without needing to create a meal entry first
 * Endpoint: generateGlucoseCurve
 */
exports.generateGlucoseCurve = onCall(
  { enforceAppCheck: true, memory: "128MiB" },
  async (request) => {
    try {
      const { data, auth } = request;
      
      // Check authentication
      if (!auth) {
        throw new Error('Authentication required');
      }
      
      // Extract parameters
      const {
        foods = [],
        baselineGlucose = 83, // Default baseline
        extended = false // Whether to return extended data
      } = data;
      
      // Basic validation
      if (!Array.isArray(foods)) {
        throw new Error('Foods must be an array');
      }
      
      // Calculate total glucose impact
      let totalImpact = 0;
      
      // Simple impact calculation for direct API use
      foods.forEach(food => {
        const carbsValue = food.macros?.carbohydrates?.value || 0;
        const glycemicIndex = food.glycemicIndex || 50; // Default medium GI
        const quantity = food.quantity || 1;
        
        // Basic formula: (GI / 100) * carbs * quantity
        const impact = (glycemicIndex / 100) * carbsValue * quantity;
        totalImpact += impact;
      });
      
      // Generate curve data points
      const curveData = generateGlucoseCurve(baselineGlucose, totalImpact);
      
      // Return the curve data
      logger.info(`Generated glucose curve for user ${auth.uid} with impact ${totalImpact}`);
      
      return { 
        success: true, 
        curveData,
        metadata: {
          totalImpact,
          impactLevel: totalImpact > 30 ? 'high' : totalImpact > 15 ? 'medium' : 'low',
          peakValue: Math.max(...curveData.map(point => point.glucoseLevel)),
          baselineGlucose
        }
      };
    } catch (error) {
      logger.error('Error generating glucose curve:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);
