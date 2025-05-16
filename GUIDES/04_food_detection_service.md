# Food Detection Service

This document provides step-by-step instructions for implementing the food detection service in the NutriSnap app using Google Cloud Vision API.

## Step 1: Create Food Detection Module

Create a new file `functions/src/food/detection.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const vision = require('@google-cloud/vision');
const path = require('path');

// Initialize Vision API client
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, '../../config/vision-api-key.json')
});

// Analyze food image
exports.analyzefoodimage = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const { imageUrl } = data;
  const userId = context.auth.uid;
  
  if (!imageUrl) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Image URL is required'
    );
  }
  
  try {
    // Create a scan record
    const scanRef = await admin.firestore().collection('users').doc(userId)
      .collection('scans').add({
        imageUrl,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'processing'
      });
    
    // Call Vision API to detect food items
    const [result] = await visionClient.annotateImage({
      image: { source: { imageUri: imageUrl } },
      features: [
        { type: 'LABEL_DETECTION', maxResults: 15 },
        { type: 'OBJECT_LOCALIZATION', maxResults: 10 }
      ]
    });
    
    // Filter for food-related labels
    const foodLabels = result.labelAnnotations
      .filter(label => {
        const desc = label.description.toLowerCase();
        return isFoodItem(desc);
      })
      .map(label => ({
        name: label.description,
        confidence: label.score
      }));
    
    // Get nutritional information
    const nutritionalInfo = await getNutritionData(foodLabels);
    
    // Update scan record with results
    await scanRef.update({
      detectedItems: foodLabels,
      nutritionalInfo,
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      scanId: scanRef.id,
      detectedItems: foodLabels,
      nutritionalInfo
    };
  } catch (error) {
    console.error('Error analyzing food image:', error);
    
    // If a scan record was created, update it with the error
    if (data.scanId) {
      await admin.firestore().collection('users').doc(userId)
        .collection('scans').doc(data.scanId).update({
          status: 'error',
          error: error.message,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get food scan result
exports.getFoodScanResult = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { scanId } = data;
  
  if (!scanId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Scan ID is required'
    );
  }
  
  try {
    const scanDoc = await admin.firestore().collection('users').doc(userId)
      .collection('scans').doc(scanId).get();
    
    if (!scanDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Scan not found');
    }
    
    return scanDoc.data();
  } catch (error) {
    console.error('Error getting food scan result:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Helper function to check if item is food
function isFoodItem(description) {
  const foodKeywords = [
    'food', 'dish', 'meal', 'cuisine', 'breakfast', 'lunch', 'dinner',
    'snack', 'fruit', 'vegetable', 'meat', 'dessert', 'bread', 'rice',
    'pasta', 'salad', 'soup', 'sandwich', 'burger', 'pizza'
  ];
  
  return foodKeywords.some(keyword => description.includes(keyword));
}

// Function to get nutrition data
// In a production app, this would call a nutrition API or database
async function getNutritionData(foodItems) {
  // For demonstration, we'll use a simple algorithm based on the detected items
  // In a real app, you would integrate with a nutrition database or API
  
  // Base values
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let sugar = 0;
  
  // Simple mapping of common foods to nutrition values
  const nutritionMap = {
    'apple': { calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4, sugar: 19 },
    'banana': { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, sugar: 14 },
    'bread': { calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 3, sugar: 5 },
    'burger': { calories: 354, protein: 20, carbs: 40, fat: 17, fiber: 3, sugar: 8 },
    'cheese': { calories: 402, protein: 25, carbs: 2, fat: 33, fiber: 0, sugar: 0.5 },
    'chicken': { calories: 239, protein: 27, carbs: 0, fat: 14, fiber: 0, sugar: 0 },
    'pasta': { calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.2, sugar: 0.5 },
    'pizza': { calories: 285, protein: 12, carbs: 36, fat: 10, fiber: 2.5, sugar: 3.8 },
    'rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0.1 },
    'salad': { calories: 152, protein: 1.2, carbs: 6, fat: 15, fiber: 1.5, sugar: 1.5 },
    // Add more foods as needed
  };
  
  // Calculate nutrition based on detected items
  for (const item of foodItems) {
    const itemName = item.name.toLowerCase();
    let matched = false;
    
    // Check for exact matches
    for (const [food, nutrition] of Object.entries(nutritionMap)) {
      if (itemName.includes(food)) {
        // Weight by confidence score
        const factor = item.confidence;
        calories += nutrition.calories * factor;
        protein += nutrition.protein * factor;
        carbs += nutrition.carbs * factor;
        fat += nutrition.fat * factor;
        fiber += nutrition.fiber * factor;
        sugar += nutrition.sugar * factor;
        matched = true;
        break;
      }
    }
    
    // If no match, add some default values
    if (!matched) {
      // Default values weighted by confidence
      const factor = item.confidence;
      calories += 100 * factor;
      protein += 5 * factor;
      carbs += 15 * factor;
      fat += 5 * factor;
      fiber += 2 * factor;
      sugar += 5 * factor;
    }
  }
  
  // Round values
  return {
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    microNutrients: {
      fiber: Math.round(fiber * 10) / 10,
      sugar: Math.round(sugar * 10) / 10,
      sodium: Math.round(300 + Math.random() * 500),
      potassium: Math.round(200 + Math.random() * 300)
    }
  };
}
```

## Step 2: Create Food Detection Service for Frontend

Create a file called `food-detection-service.js` in your frontend code:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase-config';

const functions = getFunctions(app);

// Analyze food image
export const analyzefoodimage = async (imageUrl) => {
  try {
    const analyzeFoodFn = httpsCallable(functions, 'analyzefoodimage');
    const result = await analyzeFoodFn({ imageUrl });
    return result.data;
  } catch (error) {
    console.error('Error analyzing food:', error);
    throw error;
  }
};

// Get food scan result
export const getFoodScanResult = async (scanId) => {
  try {
    const getFoodScanResultFn = httpsCallable(functions, 'getFoodScanResult');
    const result = await getFoodScanResultFn({ scanId });
    return result.data;
  } catch (error) {
    console.error('Error getting food scan result:', error);
    throw error;
  }
};

// Get scan history
export const getScanHistory = async (userId, limit = 10) => {
  try {
    // This would typically be implemented as a Cloud Function
    // For now, we'll use the Firestore SDK directly
    const { getFirestore, collection, query, orderBy, limit: limitQuery, getDocs } = await import('firebase/firestore');
    
    const db = getFirestore(app);
    const scansRef = collection(db, 'users', userId, 'scans');
    const q = query(scansRef, orderBy('timestamp', 'desc'), limitQuery(limit));
    const querySnapshot = await getDocs(q);
    
    const scans = [];
    querySnapshot.forEach((doc) => {
      scans.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return scans;
  } catch (error) {
    console.error('Error getting scan history:', error);
    throw error;
  }
};
```

## Step 3: Implement Food Analysis Flow

Create a component to handle the food analysis flow:

```javascript
// Example React component for food analysis
import React, { useState, useEffect } from 'react';
import { uploadImage } from './storage-service';
import { analyzefoodimage, getFoodScanResult } from './food-detection-service';
import { getCurrentUser } from './auth-service';
import ImageUpload from './ImageUpload'; // Component from previous step

const FoodAnalysis = () => {
  const [analyzing, setAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  
  const handleUploadComplete = async (uploadResult) => {
    try {
      setAnalyzing(true);
      setError(null);
      
      // Analyze the uploaded image
      const result = await analyzefoodimage(uploadResult.downloadURL);
      
      // Poll for results if processing is asynchronous
      if (result.status === 'processing') {
        await pollForResults(result.scanId);
      } else {
        setScanResult(result);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setError(error.message);
    } finally {
      setAnalyzing(false);
    }
  };
  
  const pollForResults = async (scanId) => {
    // Poll every 2 seconds for up to 30 seconds
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result = await getFoodScanResult(scanId);
      
      if (result.status === 'completed') {
        setScanResult(result);
        return;
      } else if (result.status === 'error') {
        setError(result.error || 'Analysis failed');
        return;
      }
    }
    
    setError('Analysis timed out');
  };
  
  return (
    <div>
      <h2>Analyze Your Food</h2>
      
      <ImageUpload onUploadComplete={handleUploadComplete} />
      
      {analyzing && <div>Analyzing your food... Please wait.</div>}
      
      {error && <div style={{ color: 'red' }}>{error}</div>}
      
      {scanResult && (
        <div>
          <h3>Analysis Results</h3>
          
          <div>
            <h4>Detected Items:</h4>
            <ul>
              {scanResult.detectedItems.map((item, index) => (
                <li key={index}>
                  {item.name} ({Math.round(item.confidence * 100)}% confidence)
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h4>Nutritional Information:</h4>
            <p>Calories: {scanResult.nutritionalInfo.calories} kcal</p>
            <p>Protein: {scanResult.nutritionalInfo.protein}g</p>
            <p>Carbs: {scanResult.nutritionalInfo.carbs}g</p>
            <p>Fat: {scanResult.nutritionalInfo.fat}g</p>
            
            <h5>Micronutrients:</h5>
            <p>Fiber: {scanResult.nutritionalInfo.microNutrients.fiber}g</p>
            <p>Sugar: {scanResult.nutritionalInfo.microNutrients.sugar}g</p>
            <p>Sodium: {scanResult.nutritionalInfo.microNutrients.sodium}mg</p>
            <p>Potassium: {scanResult.nutritionalInfo.microNutrients.potassium}mg</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FoodAnalysis;
```

## Step 4: Update Functions Index

Update your `functions/index.js` to include the food detection functions:

```javascript
// Add these if not already included
exports.analyzefoodimage = foodFunctions.analyzefoodimage;
exports.getFoodScanResult = foodFunctions.getFoodScanResult;
```

## Step 5: Deploy Food Detection Functions

Deploy your functions:

```bash
firebase deploy --only functions:analyzefoodimage,functions:getFoodScanResult
```

## Step 6: Test Food Detection

1. Upload an image through your frontend
2. Verify the image is analyzed correctly
3. Check that nutritional information is generated
4. Verify the results are stored in Firestore

## Step 7: Enhance Food Detection (Optional)

For better food detection, consider these enhancements:

1. Integrate with a specialized food recognition API like:
   - Edamam Food Database API
   - Spoonacular API
   - Nutritionix API

2. Implement a custom machine learning model for food recognition:
   - Train a model on food images
   - Deploy it to TensorFlow.js or as a Cloud Function
   - Use it to enhance the Vision API results

3. Create a food database in Firestore:
   - Store common foods with accurate nutritional information
   - Use it to look up detected items
   - Allow for manual corrections and additions

## Next Steps

Now that the food detection service is implemented, proceed to setting up the [Database Implementation](05_database_implementation.md) for storing and retrieving data.
