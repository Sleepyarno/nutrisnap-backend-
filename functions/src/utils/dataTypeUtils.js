/**
 * Utility functions for ensuring proper data types
 */

/**
 * Ensures a value is returned as a number
 * Particularly useful for nutrition values that might come from APIs as strings
 * @param {*} value - Value to convert to number
 * @param {number} defaultValue - Default value if conversion fails (default: 0)
 * @returns {number} The converted number value
 */
function ensureNumber(value, defaultValue = 0) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  
  // If already a number, return as is
  if (typeof value === 'number') {
    return value;
  }
  
  // Try to convert to number
  const converted = Number(value);
  return isNaN(converted) ? defaultValue : converted;
}

/**
 * Process nutrition data to ensure all numeric values are actually numbers
 * @param {Object} nutrition - Nutrition data object
 * @returns {Object} Processed nutrition with all numeric values as numbers
 */
function processNutritionData(nutrition) {
  if (!nutrition) {
    return {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      potassium: 0
    };
  }
  
  return {
    calories: ensureNumber(nutrition.calories),
    protein: ensureNumber(nutrition.protein),
    carbohydrates: ensureNumber(nutrition.carbohydrates),
    fat: ensureNumber(nutrition.fat),
    fiber: ensureNumber(nutrition.fiber),
    sugar: ensureNumber(nutrition.sugar),
    sodium: ensureNumber(nutrition.sodium),
    potassium: ensureNumber(nutrition.potassium)
  };
}

module.exports = {
  ensureNumber,
  processNutritionData
};
