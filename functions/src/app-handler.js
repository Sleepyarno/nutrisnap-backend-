/**
 * Dedicated express app to handle Cloud Run requests for the 'app' function.
 * This file is specifically crafted to listen on port 8080 for Cloud Run.
 */
const express = require('express');
const cors = require('cors');

// Create Express app for Cloud Run
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check route for Cloud Run
app.get('/', (req, res) => {
  console.log('Health check received on app service');
  res.status(200).send('NutriSnap API is running');
});

// This IS required for Cloud Run deployments to bind to PORT
// Firebase Cloud Run services must listen on the port specified by PORT env variable
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`App service listening on port ${port}`);
});

// Force redeploy comment

// Do not call app.listen() as Firebase Functions will do this automatically
// The HTTPS triggers in Firebase will handle HTTP serving for us

module.exports = app;
