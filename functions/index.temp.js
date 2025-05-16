// Import Firebase modules - all imports at the top
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { onCall } = require("firebase-functions/v2/https");

// Initialize Firebase
admin.initializeApp();

// Import function modules - only importing fatSecretFunctions
const fatSecretFunctions = require('./src/food/fatSecretSearch');

// This is a temporary file to allow deployment of just the FatSecret functions
// without requiring the problematic detection.js file
console.log('Using');
