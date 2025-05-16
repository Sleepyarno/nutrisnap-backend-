/**
 * Test script for FatSecret OAuth 2.0 implementation
 * 
 * This script tests the OAuth token acquisition and autocomplete functionality
 * without requiring the full Firebase emulator environment.
 */
const fatSecretAPI = require('./src/utils/fatSecretAPI');

// Load environment variables
try { require('dotenv').config(); } catch (e) { /* ignore if dotenv not installed */ }

// Simple test logger
const logger = {
  info: (...args) => console.log('INFO:', ...args),
  error: (...args) => console.error('ERROR:', ...args),
  debug: (...args) => console.log('DEBUG:', ...args)
};

// Test function
async function testFatSecretAPI() {
  try {
    logger.info('Testing FatSecret OAuth 2.0 token acquisition...');
    const token = await fatSecretAPI.getAccessToken();
    logger.info('✅ Successfully acquired OAuth token');
    
    // Test autocomplete with a few food terms
    const testTerms = ['appl', 'chick', 'salm'];
    for (const term of testTerms) {
      logger.info(`Testing autocomplete for "${term}"...`);
      const suggestions = await fatSecretAPI.autocompleteSearch(term, 5);
      logger.info(`✅ Received ${suggestions.length} suggestions for "${term}":`);
      suggestions.forEach((s, i) => logger.info(`  ${i+1}. ${s}`));
    }
    
    logger.info('\nAll tests completed successfully! Your FatSecret OAuth 2.0 implementation is working correctly.');
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testFatSecretAPI();
