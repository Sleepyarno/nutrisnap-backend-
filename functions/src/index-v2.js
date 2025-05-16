/**
 * This file isolates and exports only the functions that need to be deployed as v2 functions
 * This is a clean separation to avoid deployment conflicts
 */
const functions = require('firebase-functions/v2/https');
const appHandler = require('./app-handler');
const foodScanHandler = require('./food-scan-handler');
const foodFunctions = require('./food/detection');

// Export Cloud Run HTTP services
exports.app = functions.onRequest({ memory: "1GiB" }, appHandler);
exports.getFoodScanResult = functions.onRequest({ memory: "512MiB" }, foodScanHandler);

// Export food detection functions
exports.analyzeFoodImage = foodFunctions.analyzeFoodImage;
exports.getGlucoseCurve = foodFunctions.getGlucoseCurve;
