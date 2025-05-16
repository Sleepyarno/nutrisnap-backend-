/**
 * Utility to fix type inconsistencies in the NutriSnap response structure
 * This specifically addresses the Swift decoding error where numeric values 
 * are returned as strings causing "Expected to decode Double but found a string instead"
 */

/**
 * Fix data types in the nutrition response for iOS compatibility
 * @param {Object} responseObject - The original response object from analyzeFoodImage
 * @returns {Object} A fixed response with consistent numeric types
 */
function fixResponseTypes(responseObject) {
  if (!responseObject) return responseObject;
  
  // Create a new object to avoid mutating the original
  const fixedResponse = { ...responseObject };
  
  // Fix top-level nutrition values
  const numericFields = [
    'calories', 'protein', 'carbohydrates', 'fat', 
    'fiber', 'sugar', 'sodium', 'potassium'
  ];
  
  // Convert all numeric fields to actual numbers
  numericFields.forEach(field => {
    if (fixedResponse[field] !== undefined) {
      fixedResponse[field] = Number(fixedResponse[field]);
    }
  });
  
  // Fix ingredient-level nutrition values
  if (Array.isArray(fixedResponse.ingredients)) {
    fixedResponse.ingredients = fixedResponse.ingredients.map(ingredient => {
      const fixedIngredient = { ...ingredient };
      
      // If nutrition data exists, fix all numeric values
      if (fixedIngredient.nutrition) {
        const fixedNutrition = {};
        
        Object.keys(fixedIngredient.nutrition).forEach(key => {
          // Convert all nutrition values to numbers
          fixedNutrition[key] = Number(fixedIngredient.nutrition[key] || 0);
        });
        
        fixedIngredient.nutrition = fixedNutrition;
      }
      
      return fixedIngredient;
    });
  }
  
  return fixedResponse;
}

module.exports = {
  fixResponseTypes
};
