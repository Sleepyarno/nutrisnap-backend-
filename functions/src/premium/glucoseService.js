/* eslint-env node */
// Glucose Impact Service
// Calculates estimated glucose impact based on food glycemic index and carbohydrate content

const logger = require("firebase-functions/logger");

/**
 * Default glycemic index values for common foods
 * These are used when GI values are not available from food databases
 */
const DEFAULT_GI_VALUES = {
  // Proteins (generally low GI)
  'egg': 0,
  'eggs': 0,
  'bacon': 0,
  'sausage': 0,
  'sausages': 0,
  'tofu': 0,
  'chicken': 0,
  'beef': 0,
  'pork': 0,
  'fish': 0,
  'seafood': 0,
  
  // Dairy
  'milk': 30,
  'cheese': 0,
  'yogurt': 35,
  
  // Fruits (medium to high GI)
  'apple': 35,
  'banana': 55,
  'orange': 45,
  'berries': 30,
  'strawberry': 30,
  'blueberry': 25,
  
  // Vegetables (generally low GI)
  'broccoli': 10,
  'spinach': 0,
  'kale': 0,
  'lettuce': 0,
  'tomato': 15,
  'carrot': 35,
  'mushroom': 10,
  'mushrooms': 10,
  
  // Grains (variable GI)
  'white bread': 75,
  'whole grain bread': 55,
  'toast': 70,
  'rice': 70,
  'brown rice': 50,
  'pasta': 55,
  'oats': 55,
  'cereal': 70,
  
  // Legumes (low GI)
  'beans': 30,
  'lentils': 25,
  'chickpeas': 35,
  
  // Snacks & Sweets (high GI)
  'potato chips': 70,
  'chocolate': 45,
  'ice cream': 60,
  'cake': 70,
  'cookie': 70,
  'cookies': 70,
  
  // English Breakfast items
  'baked beans': 40,
  'black pudding': 35,
  'hash browns': 75
};

/**
 * Modifiers that affect glucose impact
 * These factors adjust the glucose impact based on other macronutrients
 */
const IMPACT_MODIFIERS = {
  FAT_REDUCTION: 0.8,    // High fat content reduces glucose impact by 20%
  FIBER_REDUCTION: 0.85, // High fiber content reduces glucose impact by 15%
  PROTEIN_REDUCTION: 0.9, // High protein content reduces glucose impact by 10%
  VINEGAR_REDUCTION: 0.75, // Vinegar/acidic foods reduce glucose impact by 25%
};

/**
 * Calculate estimated glucose impact for a single food item
 * @param {object} food - Food item object with name, carbs, and optional GI
 * @param {number} quantity - Quantity multiplier (default: 1)
 * @returns {number} - Estimated glucose impact value
 */
function calculateFoodGlucoseImpact(food, quantity = 1) {
  // Extract food properties
  const { name, macros = {}, micros = {} } = food;
  
  // Get carbs content (per 100g)
  const carbsValue = macros.carbohydrates?.value || 0;
  
  // Get or estimate glycemic index
  let glycemicIndex = food.glycemicIndex;
  
  // If GI not provided, use default value or estimate
  if (!glycemicIndex) {
    // Look for exact match in default values
    const lowerName = name.toLowerCase();
    glycemicIndex = DEFAULT_GI_VALUES[lowerName];
    
    // If no exact match, search for partial matches
    if (!glycemicIndex) {
      const matchingKey = Object.keys(DEFAULT_GI_VALUES).find(key => 
        lowerName.includes(key) || key.includes(lowerName)
      );
      glycemicIndex = matchingKey ? DEFAULT_GI_VALUES[matchingKey] : 50; // Default to medium GI (50)
    }
  }
  
  // Calculate base impact using formula: (GI / 100) * carbs * quantity
  let impact = (glycemicIndex / 100) * carbsValue * quantity;
  
  // Apply modifiers based on other nutrients
  const fiberValue = micros.fiber?.value || 0;
  const fatValue = macros.fat?.value || 0;
  const proteinValue = macros.protein?.value || 0;
  
  // Adjust for fiber content
  if (fiberValue > 5) {
    impact *= IMPACT_MODIFIERS.FIBER_REDUCTION;
  }
  
  // Adjust for fat content
  if (fatValue > 10) {
    impact *= IMPACT_MODIFIERS.FAT_REDUCTION;
  }
  
  // Adjust for protein content
  if (proteinValue > 15) {
    impact *= IMPACT_MODIFIERS.PROTEIN_REDUCTION;
  }
  
  return impact;
}

/**
 * Calculate total glucose impact for a meal with multiple food items
 * @param {Array} foodItems - Array of food items
 * @returns {object} - Glucose impact details
 */
function calculateMealGlucoseImpact(foodItems) {
  // Validate input
  if (!foodItems || !Array.isArray(foodItems) || foodItems.length === 0) {
    return { 
      totalImpact: 0,
      impactLevel: 'none',
      details: []
    };
  }
  
  // Calculate impact for each food
  const impactDetails = foodItems.map(food => {
    const quantity = food.quantity || 1;
    const impact = calculateFoodGlucoseImpact(food, quantity);
    
    return {
      name: food.name,
      impact,
      quantity,
      estimatedGI: food.glycemicIndex || 'estimated'
    };
  });
  
  // Calculate total impact
  const totalImpact = impactDetails.reduce((sum, item) => sum + item.impact, 0);
  
  // Determine impact level
  let impactLevel = 'low';
  if (totalImpact > 30) impactLevel = 'high';
  else if (totalImpact > 15) impactLevel = 'medium';
  
  return {
    totalImpact,
    impactLevel,
    details: impactDetails
  };
}

/**
 * Generate predicted glucose curve data points
 * @param {number} baselineGlucose - Baseline glucose level (default: 83)
 * @param {number} totalImpact - Total glucose impact
 * @returns {Array} - Array of data points (time, glucoseLevel)
 */
function generateGlucoseCurve(baselineGlucose = 83, totalImpact) {
  const curve = [];
  
  // Set curve parameters based on impact
  const peakTime = 45; // Minutes to peak
  const totalDuration = 180; // Total curve duration in minutes
  const peakValue = baselineGlucose + (totalImpact * 1.5); // Estimated peak value
  
  // Generate curve points (every 15 minutes)
  for (let time = 0; time <= totalDuration; time += 15) {
    let glucoseValue;
    
    if (time === 0) {
      // Starting point is baseline
      glucoseValue = baselineGlucose;
    } else if (time < peakTime) {
      // Rising phase - quadratic rise to peak
      const ratio = time / peakTime;
      glucoseValue = baselineGlucose + ((peakValue - baselineGlucose) * (ratio * ratio));
    } else {
      // Declining phase - exponential decay back to baseline
      const timeAfterPeak = time - peakTime;
      const decayRate = 0.02; // Decay rate parameter
      const remainingRatio = Math.exp(-decayRate * timeAfterPeak);
      glucoseValue = baselineGlucose + ((peakValue - baselineGlucose) * remainingRatio);
    }
    
    curve.push({
      time,
      glucoseLevel: Math.round(glucoseValue)
    });
  }
  
  return curve;
}

/**
 * Generate food swapping suggestions based on high-impact foods
 * @param {Array} foodItems - Food items with impact details
 * @returns {Array} - Array of suggestion objects
 */
function generateFoodSwapSuggestions(foodItems) {
  const highImpactFoods = foodItems
    .map(food => ({ 
      name: food.name, 
      impact: calculateFoodGlucoseImpact(food, food.quantity || 1) 
    }))
    .filter(item => item.impact > 5)
    .sort((a, b) => b.impact - a.impact); // Sort by impact (highest first)
  
  const suggestions = [];
  
  // Generate suggestions for top 2 high-impact foods
  highImpactFoods.slice(0, 2).forEach(food => {
    const suggestion = getSwapSuggestion(food.name);
    if (suggestion) {
      suggestions.push({
        originalFood: food.name,
        suggestion,
        impactReduction: `Reduces glucose impact by approximately ${suggestion.reductionPercent}%`
      });
    }
  });
  
  return suggestions;
}

/**
 * Get swap suggestion for a high-impact food
 * @param {string} foodName - Name of the high-impact food
 * @returns {object|null} - Suggestion object or null if no suggestion available
 */
function getSwapSuggestion(foodName) {
  const lowerName = foodName.toLowerCase();
  
  // Mapping of high-impact foods to lower-impact alternatives
  const swapMap = {
    'white bread': { 
      alternative: 'whole grain bread', 
      reductionPercent: 25,
      rationale: 'Higher fiber content slows glucose release'
    },
    'bread': { 
      alternative: 'whole grain bread', 
      reductionPercent: 25,
      rationale: 'Higher fiber content slows glucose release'
    },
    'toast': { 
      alternative: 'sourdough toast', 
      reductionPercent: 30,
      rationale: 'Fermentation process reduces glucose impact'
    },
    'rice': { 
      alternative: 'brown rice', 
      reductionPercent: 30,
      rationale: 'Higher fiber content slows glucose release'
    },
    'white rice': { 
      alternative: 'brown rice or cauliflower rice', 
      reductionPercent: 35,
      rationale: 'Significantly lower carbohydrate content'
    },
    'potato': { 
      alternative: 'sweet potato', 
      reductionPercent: 15,
      rationale: 'Lower glycemic index'
    },
    'cereal': { 
      alternative: 'steel-cut oats', 
      reductionPercent: 40,
      rationale: 'Less processed with higher fiber content'
    },
    'pasta': { 
      alternative: 'whole wheat pasta or zucchini noodles', 
      reductionPercent: 30,
      rationale: 'Higher fiber or vegetable-based alternative'
    }
    // Add more mappings as needed
  };
  
  // Check for exact matches
  if (swapMap[lowerName]) {
    return swapMap[lowerName];
  }
  
  // Check for partial matches
  for (const key of Object.keys(swapMap)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return swapMap[key];
    }
  }
  
  return null;
}

/**
 * Generate meal timing and activity advice
 * @param {number} totalImpact - Total glucose impact
 * @returns {Array} - Array of advice objects
 */
function generateGlucoseAdvice(totalImpact) {
  const advice = [];
  
  // Basic advice for all meals
  advice.push({
    type: 'general',
    title: 'Eat slowly',
    description: 'Taking time to eat slowly can reduce glucose spikes by up to 15%'
  });
  
  // Impact-based advice
  if (totalImpact > 20) {
    advice.push({
      type: 'activity',
      title: 'Take a 15-minute walk',
      description: 'Walking within 30 minutes after this meal can reduce glucose spikes by up to 30%'
    });
    
    advice.push({
      type: 'timing',
      title: 'Add vinegar',
      description: 'Having 1-2 tablespoons of vinegar (like in a salad dressing) before this meal can reduce glucose impact'
    });
  }
  
  if (totalImpact > 15) {
    advice.push({
      type: 'sequence',
      title: 'Eat vegetables first',
      description: 'Consuming fiber-rich vegetables before the starchy components of your meal reduces glucose spikes'
    });
  }
  
  if (totalImpact > 25) {
    advice.push({
      type: 'activity',
      title: 'Light resistance exercise',
      description: '5 minutes of light resistance exercise (squats, push-ups) before eating can improve insulin sensitivity'
    });
  }
  
  return advice;
}

module.exports = {
  calculateFoodGlucoseImpact,
  calculateMealGlucoseImpact,
  generateGlucoseCurve,
  generateFoodSwapSuggestions,
  generateGlucoseAdvice
};
