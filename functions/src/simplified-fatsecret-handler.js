/**
 * Simplified handler for FatSecret API functions
 * Uses the standard Firebase Functions approach
 */
const express = require('express');
const cors = require('cors');
const fatSecretFunctions = require('./food/fatSecretSearch');

// Create a single Express router for all FatSecret endpoints
const router = express();
router.use(cors());
router.use(express.json());

// Health check
router.get('/', (req, res) => {
  res.status(200).send('OK');
});

// FatSecret Details endpoint
router.post('/details', async (req, res) => {
  try {
    const result = await fatSecretFunctions.getFatSecretFoodDetails({
      data: req.body,
      auth: req.headers.authorization ? { uid: req.body.userId || 'cloud-run-request' } : null
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getFatSecretFoodDetails:', error);
    res.status(500).json({ error: error.message });
  }
});

// FatSecret Search endpoint
router.post('/search', async (req, res) => {
  try {
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

module.exports = router;
