/* eslint-env node */
// API utilities for rate limiting and usage monitoring

const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Cache API responses to reduce duplicate calls
const responseCache = new Map();

// Track API usage for monitoring
const apiUsageStats = {
  openai: { calls: 0, tokens: 0, cost: 0 },
  googleai: { calls: 0, tokens: 0, cost: 0 },
  openfoodfacts: { calls: 0, errors: 0 }
};

// Rate limiting configuration
const rateLimits = {
  openfoodfacts: {
    maxRequestsPerMinute: 15,
    requestTimestamps: [],
    backoffTime: 0 // Dynamic backoff time in ms
  }
};

// Cost estimates per 1000 tokens (as of May 2025)
const costEstimates = {
  openai: {
    'gpt-4o': { input: 5, output: 15 }, // $5/$15 per 1M tokens
    'gpt-4': { input: 10, output: 30 },  // $10/$30 per 1M tokens
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 } // $0.5/$1.5 per 1M tokens
  },
  googleai: {
    'text-bison': { input: 0.5, output: 0.5 }, // Simplified cost model
    'gemini-pro': { input: 1, output: 2 }
  }
};

/**
 * Check if a request to a rate-limited API is allowed
 * @param {string} apiName - Name of the API to check
 * @returns {boolean} Whether the request is allowed
 */
function isRequestAllowed(apiName) {
  if (!rateLimits[apiName]) return true;
  
  const config = rateLimits[apiName];
  const now = Date.now();
  
  // If we're in backoff period, reject the request
  if (config.backoffTime > now) {
    return false;
  }
  
  // Remove timestamps older than 1 minute
  config.requestTimestamps = config.requestTimestamps.filter(
    time => now - time < 60000
  );
  
  // Check if we've hit the rate limit
  return config.requestTimestamps.length < config.maxRequestsPerMinute;
}

/**
 * Record a successful API request
 * @param {string} apiName - Name of the API
 */
function recordRequest(apiName) {
  if (!rateLimits[apiName]) return;
  
  const config = rateLimits[apiName];
  const now = Date.now();
  config.requestTimestamps.push(now);
  
  // Update API usage stats
  if (apiUsageStats[apiName]) {
    apiUsageStats[apiName].calls++;
  }
}

/**
 * Record a failed API request and implement exponential backoff
 * @param {string} apiName - Name of the API
 * @param {number} status - HTTP status code
 */
function recordFailure(apiName, status) {
  if (!rateLimits[apiName]) return;
  
  // Update API usage stats
  if (apiUsageStats[apiName]) {
    apiUsageStats[apiName].errors++;
  }
  
  // Implement exponential backoff for rate limits (429)
  if (status === 429) {
    const config = rateLimits[apiName];
    const now = Date.now();
    
    // Start with 5 second backoff, double each time, max 5 minutes
    if (config.backoffTime === 0) {
      config.backoffTime = now + 5000;
    } else {
      const currentBackoff = config.backoffTime - now;
      const newBackoff = Math.min(currentBackoff * 2, 5 * 60 * 1000);
      config.backoffTime = now + newBackoff;
    }
    
    logger.warn(`Rate limit hit for ${apiName}. Backing off until ${new Date(config.backoffTime).toISOString()}`);
  }
}

/**
 * Get cached API response if available
 * @param {string} cacheKey - Cache key (usually API endpoint + query)
 * @returns {object|null} - Cached response or null
 */
function getCachedResponse(cacheKey) {
  if (responseCache.has(cacheKey)) {
    const cachedItem = responseCache.get(cacheKey);
    const now = Date.now();
    
    // Check if cache is still valid (24 hour TTL)
    if (now - cachedItem.timestamp < 24 * 60 * 60 * 1000) {
      return cachedItem.data;
    } else {
      // Cache expired
      responseCache.delete(cacheKey);
    }
  }
  return null;
}

/**
 * Cache API response
 * @param {string} cacheKey - Cache key 
 * @param {object} data - Response data
 */
function cacheResponse(cacheKey, data) {
  responseCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Track LLM API usage and cost
 * @param {string} provider - 'openai' or 'googleai'
 * @param {string} model - Model name
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 */
function trackLLMUsage(provider, model, inputTokens, outputTokens) {
  if (!apiUsageStats[provider]) return;
  
  const stats = apiUsageStats[provider];
  stats.calls++;
  stats.tokens += (inputTokens + outputTokens);
  
  // Calculate cost in microdollars (1/1000000 of a dollar)
  if (costEstimates[provider] && costEstimates[provider][model]) {
    const costs = costEstimates[provider][model];
    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;
    stats.cost += inputCost + outputCost;
  }
  
  // Log the usage
  logger.info(`LLM API usage: ${provider} ${model} - ${inputTokens} input tokens, ${outputTokens} output tokens`);
  
  // Store usage data in Firestore for monitoring
  storeUsageStats();
}

/**
 * Store current usage stats in Firestore
 */
async function storeUsageStats() {
  try {
    // Only store stats once per hour to reduce write operations
    const now = new Date();
    const hourKey = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}`;
    
    const db = admin.firestore();
    await db.collection('apiUsage').doc(hourKey).set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      stats: apiUsageStats,
      environment: process.env.NODE_ENV || 'production'
    }, { merge: true });
  } catch (error) {
    logger.error('Error storing API usage stats:', error);
    // Don't throw, this is non-critical
  }
}

module.exports = {
  isRequestAllowed,
  recordRequest,
  recordFailure,
  getCachedResponse,
  cacheResponse,
  trackLLMUsage,
  storeUsageStats,
  apiUsageStats
};
