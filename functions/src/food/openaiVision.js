/*
 * openaiVision.js
 * Utility to call OpenAI GPT-4o Vision API and extract food ingredients from an image.
 */
require('dotenv').config();
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Calls OpenAI GPT-4o Vision API with a food image URL and returns detected food items.
 * @param {string} imageUrl - Publicly accessible image URL
 * @returns {Promise<string[]>} List of detected food ingredient names
 */
async function detectIngredientsWithOpenAIVision(imageUrl) {
  const prompt = [
    {
      type: 'text',
      text: 'You are a nutrition expert. List all distinct food items you see in this meal photo. Be specific and use common food names (e.g., "fried eggs", "bacon", "baked beans", "toast"). Ignore non-food objects. Return a JSON array of strings, each being a food item.'
    },
    {
      type: 'image_url',
      image_url: {
        url: imageUrl
      }
    }
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 300,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  });

  // Extract the content from the response
  const content = response.choices[0]?.message?.content;
  let ingredients = [];
  
  try {
    // Parse the JSON response
    const parsedContent = JSON.parse(content);
    
    // Handle different possible response formats
    if (Array.isArray(parsedContent)) {
      // Direct array response
      ingredients = parsedContent;
    } else if (typeof parsedContent === 'object') {
      // Check for common field names that might contain the ingredients array
      if (Array.isArray(parsedContent.ingredients)) {
        ingredients = parsedContent.ingredients;
      } else if (Array.isArray(parsedContent.food_items)) {
        ingredients = parsedContent.food_items;
      } else if (Array.isArray(parsedContent.foods)) {
        ingredients = parsedContent.foods;
      } else if (Array.isArray(parsedContent.items)) {
        ingredients = parsedContent.items;
      } else {
        // Last resort: look for any array property in the response
        const arrayProps = Object.entries(parsedContent)
          .filter(([_, value]) => Array.isArray(value))
          .map(([_, value]) => value);
          
        if (arrayProps.length > 0) {
          // Use the first array found
          ingredients = arrayProps[0];
        } else {
          throw new Error('No ingredient array found in response');
        }
      }
    } else {
      throw new Error('Response is neither an array nor an object');
    }
  } catch (err) {
    throw new Error(`Failed to parse OpenAI Vision output: ${err.message}. Raw content: ${content}`);
  }
  return ingredients;
}

module.exports = { detectIngredientsWithOpenAIVision };
