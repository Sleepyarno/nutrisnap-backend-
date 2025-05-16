/* eslint-env node */
// LLM Enhancer for food detection
// Provides verification and enhancement of detected ingredients using multiple LLMs

// Load .env for local dev
try { require('dotenv').config(); } catch (e) { /* ignore if dotenv not installed */ }

const logger = require("firebase-functions/logger");
const { OpenAI } = require('openai');
const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const apiUtils = require('../utils/apiUtils'); // Import API utilities for rate limiting and cost monitoring

// Configuration for LLM providers
const LLM_CONFIG = {
  // Maximum retries before giving up
  MAX_RETRIES: 2,
  
  // OpenAI settings
  OPENAI: {
    MODEL: process.env.OPENAI_MODEL || 'gpt-4o',
    TEMPERATURE: 0.3
  },
  
  // Google AI Platform settings
  GOOGLE_AI: {
    PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT || 'nutrisnap2',
    LOCATION: process.env.GOOGLE_AI_LOCATION || 'us-central1',
    MODEL: process.env.GOOGLE_AI_MODEL || 'text-bison',
    TEMPERATURE: 0.2,
    TOP_K: 40,
    TOP_P: 0.8,
    MAX_OUTPUT_TOKENS: 1024
  },
  
  // Combination strategy
  USE_COMBINED_MODELS: process.env.USE_COMBINED_MODELS === 'true' || true
};

/**
 * Initialize OpenAI client
 * @returns {OpenAI} OpenAI client instance
 */
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set in environment.');
    return null;
  }
  try {
    return new OpenAI({ apiKey });
  } catch (error) {
    logger.error('Error initializing OpenAI client:', error);
    return null;
  }
}

/**
 * Initialize Google AI Platform client
 * @returns {PredictionServiceClient} PredictionServiceClient instance
 */
function getGoogleAIClient() {
  try {
    return new PredictionServiceClient();
  } catch (error) {
    logger.error('Error initializing Google AI client:', error);
    return null;
  }
}



/**
 * Call OpenAI API to enhance food detection results
 * @param {string} prompt - Formatted prompt for the LLM
 * @returns {Promise<object>} Enhanced food data
 */
async function callOpenAI(prompt) {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error('OpenAI client initialization failed');
  }

  try {
    const response = await openai.chat.completions.create({
      model: LLM_CONFIG.OPENAI.MODEL,
      temperature: LLM_CONFIG.OPENAI.TEMPERATURE,
      messages: [
        {
          role: "system",
          content: "You are a food analysis assistant that accurately identifies and verifies ingredients in meals. You provide detailed nutritional insights and always respond in a consistent JSON format."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Track token usage and cost
    if (response.usage) {
      const { prompt_tokens, completion_tokens } = response.usage;
      apiUtils.trackLLMUsage(
        'openai',
        LLM_CONFIG.OPENAI.MODEL,
        prompt_tokens,
        completion_tokens
      );
      
      logger.info(`OpenAI API usage: ${prompt_tokens} prompt tokens, ${completion_tokens} completion tokens`);
    }

    return response.choices[0]?.message?.content;
  } catch (error) {
    logger.error('OpenAI API call failed:', error);
    throw error;
  }
}

/**
 * Call Google AI Platform API to enhance food detection results
 * @param {string} prompt - Formatted prompt for the LLM
 * @returns {Promise<object>} Enhanced food data
 */
async function callGoogleAI(prompt) {
  const client = getGoogleAIClient();
  if (!client) {
    throw new Error('Google AI client initialization failed');
  }

  try {
    const config = LLM_CONFIG.GOOGLE_AI;
    const name = `projects/${config.PROJECT_ID}/locations/${config.LOCATION}/publishers/google/models/${config.MODEL}`;
    
    const instanceValue = {
      prompt: `You are a food analysis assistant that verifies detected ingredients in meals and provides accurate descriptions. Return only JSON format.\n\n${prompt}`
    };
    
    const instanceObj = {
      structValue: { 
        fields: { 
          prompt: { stringValue: instanceValue.prompt } 
        } 
      }
    };
    
    const parameterObj = {
      structValue: {
        fields: {
          temperature: { numberValue: config.TEMPERATURE },
          maxOutputTokens: { intValue: config.MAX_OUTPUT_TOKENS },
          topK: { intValue: config.TOP_K },
          topP: { numberValue: config.TOP_P }
        }
      }
    };
    
    const request = {
      endpoint: name,
      instances: [instanceObj],
      parameters: parameterObj
    };
    
    const [response] = await client.predict(request);
    const textResponse = response.predictions[0]?.structValue?.fields?.content?.stringValue || '{}';
    
    // Extract JSON from response (handle cases where text might have markdown or extra content)
    const jsonMatch = textResponse.match(/```json\n([\s\S]*?)\n```/) || 
                      textResponse.match(/```\n([\s\S]*?)\n```/) || 
                      [null, textResponse];
    
    const jsonText = jsonMatch[1]?.trim() || textResponse.trim();
    
    // Estimate token count (Google AI doesn't provide token counts directly)
    // Rough estimate: 1 token ≈ 4 characters for English text
    const inputTokensEstimate = Math.ceil(instanceValue.prompt.length / 4);
    const outputTokensEstimate = Math.ceil(textResponse.length / 4);
    
    // Track usage for cost monitoring
    apiUtils.trackLLMUsage(
      'googleai',
      config.MODEL,
      inputTokensEstimate,
      outputTokensEstimate
    );
    
    logger.info(`Google AI usage estimate: ${inputTokensEstimate} input tokens, ${outputTokensEstimate} output tokens`);
    
    try {
      return JSON.parse(jsonText);
    } catch (parseError) {
      logger.error('Failed to parse JSON from Google AI response:', parseError);
      // Attempt to extract any JSON-like structure from the text
      const jsonPattern = /{[\s\S]*}/;
      const extractedJson = jsonText.match(jsonPattern);
      if (extractedJson) {
        return JSON.parse(extractedJson[0]);
      }
      throw new Error('Invalid JSON response from Google AI');
    }
  } catch (error) {
    logger.error('Google AI API call failed:', error);
    throw error;
  }
}



/**
 * Format the prompt for LLM processing
 * @param {Array} ingredients - Detected ingredients 
 * @param {string} mealName - Classified meal name
 * @param {Array} rawLabels - Raw image labels from Vision API
 * @returns {string} Formatted prompt
 */
function formatLLMPrompt(ingredients, mealName, rawLabels) {
  let specialInstructions = '';
  let isEnglishBreakfast = false;
  
  // Check raw labels for potential English breakfast components
  const breakfastComponents = ['egg', 'sausage', 'bacon', 'bean', 'tomato', 'mushroom', 'toast', 'black pudding'];
  const detectedBreakfastItems = rawLabels.filter(label => 
    breakfastComponents.some(component => label.toLowerCase().includes(component))
  );
  
  // Add special instructions for English breakfast
  // Explicitly check for English breakfast in either mealName or raw labels
  const englishBreakfastTerms = ['english breakfast', 'full breakfast', 'fry up', 'full english'];
  const containsEnglishBreakfastTerm = (
    (mealName && typeof mealName === 'string' && 
     englishBreakfastTerms.some(term => mealName.toLowerCase().includes(term))) ||
    rawLabels.some(label => englishBreakfastTerms.some(term => label.toLowerCase().includes(term)))
  );
  
  // Also consider it might be an English breakfast if we detect multiple components
  const hasMultipleBreakfastComponents = detectedBreakfastItems.length >= 2;
  
  // Determine if this is likely an English breakfast
  if (containsEnglishBreakfastTerm || hasMultipleBreakfastComponents) {
    isEnglishBreakfast = true;
    logger.info('English breakfast detected in prompt formatting - components: ' + detectedBreakfastItems.join(', '));
    specialInstructions = `
URGENT - ENGLISH BREAKFAST DETECTION REQUIREMENTS:
- This image shows an English breakfast (Full English/fry up) with MULTIPLE SEPARATE FOOD ITEMS.
- You MUST list EACH individual component as a separate entry in the verifiedIngredients array.
- I repeat: DO NOT return a single "English Breakfast" item. Instead return each component separately.
- Standard components to look for: eggs (fried or scrambled), bacon, sausages, baked beans, toast, grilled tomatoes, mushrooms, and black pudding.
- In this specific image, we can see: ${detectedBreakfastItems.join(', ')}.
- CRITICAL: Return EACH visible component as a separate item in the verifiedIngredients list with quantities.
- Example correct response for an English breakfast would include multiple items like ["2 Fried eggs", "3 Sausage links", "2 slices Bacon", "Portion of Baked beans"].
- If any traditional components are missing from the visible items, list them in missingItems.
`;
  } else if (mealName && typeof mealName === 'string' && 
      (mealName.toLowerCase().includes('platter') || 
       mealName.toLowerCase().includes('mixed') || 
       mealName.toLowerCase().includes('combo') ||
       mealName.toLowerCase().includes('meal'))) {
    // Special handling for other multi-component meals/platters
    specialInstructions = `
IMPORTANT - MULTI-COMPONENT MEAL GUIDELINES:
- This appears to be a meal with multiple distinct components.
- DO NOT combine separate food items into a single item.
- Return EACH distinct component as a separate item in the verifiedIngredients list.
- Specify exact quantities for each component when possible.
- Be precise about each component (e.g., "grilled chicken breast" not just "chicken").
`;
  }
  
  return `
Food Analysis Task:
You are analyzing a food image detected as "${mealName || 'unknown meal'}". Your primary task is to identify ALL individual food components.

Raw detected ingredients: ${ingredients.map(i => i.name).join(', ')}
Raw image labels: ${rawLabels.join(', ')}
${specialInstructions}
Perform the following detailed analysis:
1. IDENTIFY COMPONENTS: List EACH distinct food item separately. For mixed meals like English breakfast or platters, identify EACH component individually.
2. VERIFY: Filter the ingredient list to ONLY include items that truly belong in this meal. Remove misidentified items.
3. QUANTITIES: For each ingredient, estimate the quantity (e.g., "2 eggs" instead of just "eggs")
4. MISSING ITEMS: Identify traditional items that would be expected in this type of meal but appear to be missing
5. DESCRIBE: Create a brief, appetizing description of this meal (max 2 sentences)

Return JSON with this structure ONLY:
{
  "verifiedIngredients": ["ingredient1 (quantity)", "ingredient2 (quantity)", ...],
  "missingItems": ["missing item 1", "missing item 2", ...],
  "description": "description text",
  "nutritionNotes": "brief note about nutrition features"
}
`;
}

/**
 * Process the LLM response to enhance ingredient detection
 * @param {string|object} llmResponse - Raw or parsed response from LLM
 * @param {Array} originalIngredients - Original detected ingredients
 * @returns {object} Enhanced data with verified ingredients and description
 */
function processLLMResponse(llmResponse, originalIngredients) {
  let enhancedData = {
    ingredients: [...originalIngredients], // Default to original data if processing fails
    description: null,
    nutritionNotes: null,
    missingItems: []
  };
  
  try {
    // Check if we need to parse the response from string to JSON
    let parsedResponse;
    if (typeof llmResponse === 'string') {
      try {
        parsedResponse = JSON.parse(llmResponse);
        logger.info('Successfully parsed LLM response as JSON');
      } catch (parseError) {
        // If standard JSON parse fails, try to extract JSON from the string using regex
        logger.warn('Failed to parse raw LLM response, attempting to extract JSON', parseError.message);
        
        // Try multiple regex patterns to extract JSON
        const jsonPatterns = [
          /\{[\s\S]*?\}/m,          // Simple object pattern
          /```json\s*([\s\S]*?)\s*```/m,  // Code block with json tag
          /```\s*([\s\S]*?)\s*```/m      // Any code block
        ];
        
        let extractedJson = null;
        for (const pattern of jsonPatterns) {
          const match = llmResponse.match(pattern);
          if (match) {
            try {
              const jsonText = match[1] || match[0];
              extractedJson = JSON.parse(jsonText.trim());
              logger.info('Successfully extracted JSON using pattern');
              break;
            } catch (e) {
              logger.warn('Failed extraction attempt with pattern', e.message);
            }
          }
        }
        
        if (extractedJson) {
          parsedResponse = extractedJson;
        } else {
          logger.error('All JSON extraction methods failed for LLM response');
          return enhancedData;
        }
      }
    } else {
      // Response is already an object
      parsedResponse = llmResponse;
      logger.info('LLM response was already an object');
    }
    
    // Log the parsed response for debugging
    logger.info('Parsed LLM response:', JSON.stringify(parsedResponse));
    
    // Extract verified ingredients and format
    if (parsedResponse.verifiedIngredients && 
        Array.isArray(parsedResponse.verifiedIngredients) &&
        parsedResponse.verifiedIngredients.length > 0) {
      
      // Clean up and normalize the verified ingredient names
      const verifiedNames = parsedResponse.verifiedIngredients.map(name => {
        // Skip if not a string
        if (typeof name !== 'string') {
          logger.warn('Non-string ingredient in LLM response:', name);
          return '';
        }
        
        // Trim any leading/trailing whitespace
        let cleanName = name.trim();
        
        // Remove quotes if they exist
        if ((cleanName.startsWith('"') && cleanName.endsWith('"')) ||
            (cleanName.startsWith('\'') && cleanName.endsWith('\'')))
        {
          cleanName = cleanName.substring(1, cleanName.length - 1);
        }
        
        return cleanName;
      }).filter(name => name.length > 0); // Filter out any empty strings
      
      // Log the verified names after cleaning
      logger.info('Verified ingredients after cleaning:', verifiedNames);
      
      // Check if this looks like an English breakfast based on components
      const breakfastComponents = ['egg', 'sausage', 'bacon', 'bean', 'toast', 'tomato', 'mushroom'];
      const isEnglishBreakfast = verifiedNames.some(name => 
        breakfastComponents.some(component => name.toLowerCase().includes(component))
      ) && verifiedNames.length >= 2;
      
      if (isEnglishBreakfast) {
        logger.info('ENGLISH BREAKFAST DETECTED by component analysis');
      }
      
      // For multi-component meals, ensure we preserve all separate components
      // This is critical for dishes like English breakfast
      if (verifiedNames.length > 1 || isEnglishBreakfast) {
        logger.info('Multi-component meal detected with ' + verifiedNames.length + ' components:', verifiedNames);
        // Create new ingredient objects for each verified component
        enhancedData.ingredients = verifiedNames.map(name => {
          // Try to find a matching original ingredient first
          const matchingOriginal = originalIngredients.find(orig => {
            if (!orig || !orig.name) return false;
            const origName = orig.name.toLowerCase();
            const verifiedLower = name.toLowerCase();
            return origName.includes(verifiedLower) || verifiedLower.includes(origName);
          });
          
          if (matchingOriginal) {
            // Clone the matching original but update the name
            return {
              ...matchingOriginal,
              name: name, // Use the verified name with quantity
              verifiedByLLM: true
            };
          } else {
            // Create a new ingredient object
            return {
              name: name,
              nutrition: null, // Will be populated later
              verifiedByLLM: true,
              addedByLLM: true
            };
          }
        });
      } else {
        // Single component detected, but check if it's potentially a dish that should be broken down
        if (verifiedNames.length === 1 && 
            (verifiedNames[0].toLowerCase().includes('english breakfast') || 
             verifiedNames[0].toLowerCase().includes('full breakfast'))) {
          
          logger.warn('LLM returned a single "English Breakfast" item instead of components. Creating standard components.');
          
          // Create standard English breakfast components as a fallback
          const standardComponents = [
            'Fried Eggs (2)',
            'Pork Sausages (2)',
            'Bacon Rashers (2)',
            'Baked Beans (portion)',
            'Grilled Tomatoes (2)',
            'Toast (2 slices)'
          ];
          
          enhancedData.ingredients = standardComponents.map(name => ({
            name: name,
            nutrition: null, // Will be populated later
            verifiedByLLM: true,
            addedByLLM: true
          }));
          
          logger.info('Created standard English breakfast components as fallback');
        } else {
          // For single-component foods, use the existing mapping function
          enhancedData.ingredients = mapVerifiedToOriginal(verifiedNames, originalIngredients);
        }
      }
    }
    
    // Extract missing items if available
    if (parsedResponse.missingItems && 
        Array.isArray(parsedResponse.missingItems)) {
      enhancedData.missingItems = parsedResponse.missingItems
        .map(item => item.trim())
        .filter(item => item.length > 0); // Filter out empty strings
    }
    
    // Extract description if available
    if (parsedResponse.description && typeof parsedResponse.description === 'string') {
      enhancedData.description = parsedResponse.description.trim();
    }
    
    // Extract nutrition notes if available
    if (parsedResponse.nutritionNotes && typeof parsedResponse.nutritionNotes === 'string') {
      enhancedData.nutritionNotes = parsedResponse.nutritionNotes.trim();
    }
    
    // Log the final enhanced data for debugging
    logger.info('Enhanced data after LLM processing:', {
      ingredients: enhancedData.ingredients.map(i => i.name),
      description: enhancedData.description,
      missingItems: enhancedData.missingItems
    });
    
    return enhancedData;
  } catch (error) {
    logger.error('Error processing LLM response:', error);
    return enhancedData; // Return original data on error
  }
}

/**
 * Map verified ingredient names back to original ingredient objects
 * @param {Array} verifiedNames - Verified ingredient names
 * @param {Array} originalIngredients - Original detected ingredients
 * @returns {Array} Processed ingredients with original data preserved
 */
function mapVerifiedToOriginal(verifiedNames, originalIngredients) {
  // Initialize with empty array
  let processedIngredients = [];
  
  // Track which original ingredients have been matched
  const matchedOriginals = new Set();
  
  // First, try to map verified names to original ingredients to preserve nutrition data
  verifiedNames.forEach(verifiedName => {
    const lowerVerifiedName = verifiedName.toLowerCase();
    let bestMatch = null;
    let bestMatchScore = 0;
    
    // Try to find the best match in original ingredients
    originalIngredients.forEach((originalIngredient, index) => {
      // Skip if already matched
      if (matchedOriginals.has(index)) return;
      
      const lowerOriginalName = originalIngredient.name.toLowerCase();
      
      // Calculate a similarity score
      let score = 0;
      
      // Exact match gets highest score
      if (lowerOriginalName === lowerVerifiedName) {
        score = 100;
      }
      // Contains relationship gets medium score
      else if (lowerOriginalName.includes(lowerVerifiedName)) {
        score = 70;
      }
      else if (lowerVerifiedName.includes(lowerOriginalName)) {
        score = 60;
      }
      // Word overlap gets lower score
      else {
        const origWords = lowerOriginalName.split(' ');
        const verWords = lowerVerifiedName.split(' ');
        const commonWords = origWords.filter(word => verWords.includes(word));
        if (commonWords.length > 0) {
          score = (commonWords.length / Math.max(origWords.length, verWords.length)) * 50;
        }
      }
      
      // Update the best match if we found a better one
      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = { ingredient: originalIngredient, index };
      }
    });
    
    // If we found a good match (score > 30)
    if (bestMatch && bestMatchScore > 30) {
      // Mark this original as matched
      matchedOriginals.add(bestMatch.index);
      
      // Add the original ingredient but with the verified name
      processedIngredients.push({
        ...bestMatch.ingredient,
        name: verifiedName, // Use the verified name from LLM
        verifiedByLLM: true,
        matchScore: bestMatchScore // For debugging
      });
    } else {
      // If no good match was found, add as a new ingredient
      processedIngredients.push({
        name: verifiedName,
        nutrition: null, // Will be populated later in the detection flow
        verifiedByLLM: true,
        addedByLLM: true
      });
    }
  });
  
  // Log the mapping results
  logger.info('Ingredient mapping results:', {
    originalCount: originalIngredients.length,
    verifiedCount: verifiedNames.length,
    matchedCount: matchedOriginals.size,
    resultCount: processedIngredients.length
  });
  
  return processedIngredients;
}

/**
 * Main function to enhance food detection with LLMs
 * @param {Array} ingredients - Detected ingredients
 * @param {string} mealName - Classified meal name
 * @param {Array} rawLabels - Raw image labels from Vision API
 * @returns {Promise<object>} Enhanced results
 */
async function enhanceFoodDetection(ingredients, mealName, rawLabels) {
  // Skip enhancement in test environment unless explicitly enabled
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_LLM_IN_TEST !== 'true') {
    logger.info('Skipping LLM enhancement in test environment');
    return { ingredients, description: null, nutritionNotes: null, missingItems: [] };
  }

  // Skip if no ingredients or very few labels (not enough context)
  if (!ingredients.length || !rawLabels.length) {
    logger.info('Skipping LLM enhancement due to insufficient data');
    return { ingredients, description: null, nutritionNotes: null, missingItems: [] };
  }

  const prompt = formatLLMPrompt(ingredients, mealName, rawLabels);
  
  // Check if we should use the combined approach
  if (LLM_CONFIG.USE_COMBINED_MODELS) {
    return enhanceWithCombinedModels(prompt, ingredients, mealName);
  } else {
    // Fall back to OpenAI-only approach
    return enhanceWithOpenAI(prompt, ingredients);
  }
}

/**
 * Enhance food detection using only OpenAI
 * @param {string} prompt - Formatted prompt for the LLM
 * @param {Array} ingredients - Original detected ingredients
 * @returns {Promise<object>} Enhanced results
 */
async function enhanceWithOpenAI(prompt, ingredients) {
  let retries = 0;

  while (retries <= LLM_CONFIG.MAX_RETRIES) {
    try {
      logger.info(`Attempting to enhance food detection using OpenAI (attempt ${retries + 1})`);
      
      // Call OpenAI
      const llmResponse = await callOpenAI(prompt);
      
      // Process the response
      const enhancedResults = processLLMResponse(llmResponse, ingredients);
      logger.info('Successfully enhanced food detection with OpenAI');
      
      return enhancedResults;
    } catch (error) {
      logger.error(`OpenAI enhancement attempt ${retries + 1} failed:`, error);
      retries++;
      
      // If we've exhausted retries, return original data
      if (retries > LLM_CONFIG.MAX_RETRIES) {
        logger.warn('OpenAI enhancement failed after all attempts, returning original data');
        return { 
          ingredients, 
          description: null, 
          nutritionNotes: null,
          missingItems: [] 
        };
      }
    }
  }
}

/**
 * Enhance food detection using both OpenAI and Google AI models combined
 * @param {string} prompt - Formatted prompt for the LLMs
 * @param {Array} ingredients - Original detected ingredients
 * @param {string} mealName - Classified meal name
 * @returns {Promise<object>} Enhanced results with combined insights
 */
async function enhanceWithCombinedModels(prompt, ingredients, mealName) {
  try {
    logger.info('Attempting to enhance food detection using combined LLM approach');
    
    // Try OpenAI first - less memory intensive approach by not loading both models at once
    let openaiResult = null;
    try {
      logger.info('Attempting to enhance with OpenAI first');
      openaiResult = await callOpenAI(prompt);
      logger.info('OpenAI response: Success');
    } catch (openaiError) {
      logger.warn('OpenAI enhancement failed:', openaiError);
    }
    
    // If OpenAI failed or we want to try Google AI too for combined approach
    let googleResult = null;
    if (!openaiResult || process.env.ALWAYS_TRY_BOTH_MODELS === 'true') {
      try {
        logger.info('Attempting to enhance with Google AI');
        googleResult = await callGoogleAI(prompt);
        logger.info('Google AI response: Success');
      } catch (googleError) {
        logger.warn('Google AI enhancement failed:', googleError);
      }
    }
    
    // If both models returned results, combine their insights
    if (openaiResult && googleResult) {
      logger.info('Both models succeeded - combining insights');
      const combinedResults = combineInsights(openaiResult, googleResult, ingredients);
      logger.info('Successfully enhanced food detection with combined LLMs');
      return combinedResults;
    } 
    // If only one model succeeded, use its results
    else if (openaiResult) {
      logger.info('Only OpenAI succeeded - using its insights');
      return processLLMResponse(openaiResult, ingredients);
    } 
    else if (googleResult) {
      logger.info('Only Google AI succeeded - using its insights');
      return processLLMResponse(googleResult, ingredients);
    }
    
    // Both models failed
    logger.warn('Both LLM models failed - returning original data');
    return { 
      ingredients, 
      description: null, 
      nutritionNotes: null,
      missingItems: [] 
    };
  } catch (error) {
    logger.error('Combined model enhancement failed:', error);
    return { 
      ingredients, 
      description: null, 
      nutritionNotes: null,
      missingItems: [] 
    };
  }
}

module.exports = {
  enhanceFoodDetection,
  // Export these for testing
  formatLLMPrompt,
  processLLMResponse,
  LLM_CONFIG
};
