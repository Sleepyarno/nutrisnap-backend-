/**
 * Standalone HTTP server for getFoodScanResult
 * This is a Cloud Run compatible server that wraps the Firebase function
 */
const express = require('express');
const cors = require('cors');
const foodFunctions = require('./src/food/detection');
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase (required for the function)
try {
  admin.initializeApp();
  console.log('Firebase admin initialized successfully');
} catch (e) {
  console.log('Firebase admin initialization error:', e.message);
}

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint (required for Cloud Run)
app.get('/api/health', (req, res) => {
  console.log('Health check called');
  res.json({ status: 'ok' });
});

// Root path health check
app.get('/', (req, res) => {
  console.log('Root path called');
  res.json({ status: 'Service is running. Use /api/getFoodScanResult for function access.' });
});

// Wrap the Firebase function in an HTTP endpoint
app.post('/api/getFoodScanResult', async (req, res) => {
  console.log('getFoodScanResult endpoint called with body:', JSON.stringify(req.body));
  try {
    // Simple wrapper around the Firebase function
    const result = await foodFunctions.getFoodScanResult.run(req.body, {
      auth: req.headers.authorization ? { uid: 'http-caller' } : null,
      app: { appId: 'http-caller' }
    });
    console.log('getFoodScanResult completed successfully');
    res.json(result);
  } catch (error) {
    console.error('Error in getFoodScanResult:', error);
    res.status(500).json({ 
      error: error.message,
      success: false,
      message: 'Error calling getFoodScanResult function'
    });
  }
});

// Start the server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`getFoodScanResult server running on port ${port}`);
});
