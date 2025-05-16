/**
 * Dedicated express app to handle Cloud Run requests for the 'searchFatSecretNutrition' function.
 * This file is specifically crafted for Cloud Run compatibility.
 */
const express = require('express');
const cors = require('cors');
const fatSecretFunctions = require('./food/fatSecretSearch');

// Create Express app for Cloud Run
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check route for Cloud Run
app.get('/', (req, res) => {
  console.log('Health check received on searchFatSecretNutrition service');
  res.status(200).send('OK');
});

// FatSecret search endpoint
app.post('/', async (req, res) => {
  try {
    console.log('Received searchFatSecretNutrition request');
    const result = await fatSecretFunctions.searchFatSecretNutrition({
      data: req.body,
      auth: req.headers.authorization ? { uid: req.body.userId || 'cloud-run-request' } : null
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in searchFatSecretNutrition:', error);
    res.status(500).json({ error: error.message });
  }
});

// Do NOT call app.listen() here - Firebase Functions handles this

module.exports = app;
