/* eslint-env node */
// Premium Features Index
// Exports all premium feature functions

// Export premium status functions
const premium = require('./premium');
exports.checkPremiumStatus = premium.checkPremiumStatus;
exports.enablePremiumForTesting = premium.enablePremiumForTesting;

// Export glucose advice functions
const advice = require('./advice');
exports.getNutritionAdvice = advice.getNutritionAdvice;

// Export direct glucose API for frontend
const glucoseApi = require('./glucoseApi');
exports.generateGlucoseCurve = glucoseApi.generateGlucoseCurve;

// Export meal tracking and glucose prediction functions
const meals = require('./meals');
exports.createMealEntry = meals.createMealEntry;
exports.getMealEntry = meals.getMealEntry;
exports.getMealEntries = meals.getMealEntries;
exports.updateMealEntry = meals.updateMealEntry;
exports.deleteMealEntry = meals.deleteMealEntry;
exports.getMealsSummary = meals.getMealsSummary;
