/**
 * Standardized Cloud Run handler factory for all NutriSnap API functions
 * 
 * This module creates properly configured Express apps for Cloud Run functions
 * with consistent error handling, health checks, and port binding
 */
const express = require('express');
const cors = require('cors');
const logger = require("firebase-functions/logger");

/**
 * Creates a standardized Express handler for Cloud Run functions
 * @param {string} functionName - Name of the function (for logging)
 * @param {function} handlerFn - The actual handler function that processes requests
 * @returns {Express} - Configured Express app
 */
function createCloudRunHandler(functionName, handlerFn) {
  // Create Express app with standard middleware
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  // Standard health check route
  app.get('/', (req, res) => {
    logger.info(`Health check received on ${functionName} service`);
    res.status(200).send('OK');
  });
  
  // Main handler route with standardized logging and error handling
  app.post('/', async (req, res) => {
    try {
      logger.info(`Received ${functionName} request`);
      
      // Call the actual handler with standardized auth context
      const result = await handlerFn({
        data: req.body,
        auth: req.headers.authorization ? { uid: req.body.userId || 'cloud-run-request' } : null
      });
      
      res.status(200).json(result);
    } catch (error) {
      logger.error(`Error in ${functionName}:`, error);
      res.status(500).json({ 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  return app;
}

module.exports = { createCloudRunHandler };
