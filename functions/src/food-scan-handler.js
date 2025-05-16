/**
 * Dedicated express app to handle Cloud Run requests for the 'getFoodScanResult' function.
 * This file is specifically crafted to listen on port 8080 for Cloud Run.
 */
const express = require('express');
const cors = require('cors');
const foodFunctions = require('./food/detection');

// Create Express app for Cloud Run
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check route for Cloud Run
app.get('/', (req, res) => {
  console.log('Health check received on getFoodScanResult service');
  res.status(200).send('OK');
});

// FoodScan endpoint
app.post('/', async (req, res) => {
  try {
    console.log('Received getFoodScanResult request:', req.body);
    const result = await foodFunctions.getFoodScanResult({
      data: req.body,
      auth: req.headers.authorization ? { uid: req.body.userId || 'cloud-run-request' } : null
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getFoodScanResult:', error);
    res.status(500).json({ error: error.message });
  }
});

// Do not call app.listen() in this file
// Firebase Functions provides its own HTTP server when deployed

module.exports = app;
