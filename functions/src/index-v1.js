/**
 * This file isolates and exports only the functions that need to be deployed as v1 functions
 * This is a clean separation to avoid deployment conflicts
 */
const authFunctions = require('./auth/auth');
const storageFunctions = require('./food/storage');

// Export authentication functions
exports.createUserProfile = authFunctions.createUserProfile;
exports.updateUserProfile = authFunctions.updateUserProfile;
exports.getUserProfile = authFunctions.getUserProfile;

// Export storage functions
exports.getUploadUrl = storageFunctions.getUploadUrl;
exports.processUploadedImage = storageFunctions.processUploadedImage;
