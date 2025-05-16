const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Example route for health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// TODO: Import and mount your actual API routes here
// e.g. app.use('/api/auth', require('./auth/authRoutes'));

module.exports = app;

// Helper function to ensure the app is listening when deployed as a Cloud Run function
// REMOVED: ensureServerListening function and its call block
// Firebase Functions onRequest handles the server listening itself.
