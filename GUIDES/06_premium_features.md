# Premium Features

This document provides step-by-step instructions for implementing premium features in the NutriSnap app, focusing on glucose prediction and metabolic advice.

## Step 1: Create Premium Features Module

Create a new file `functions/src/premium/glucose.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Predict glucose response (premium feature)
exports.predictGlucoseResponse = functions.https.onCall(async (data, context) => {
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
    // Check if user is premium
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    const userData = userDoc.data();
    if (!userData.isPremium) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Premium subscription required for this feature'
      );
    }
    
    // Get scan data
    const scanDoc = await admin.firestore().collection('users').doc(userId)
      .collection('scans').doc(scanId).get();
    
    if (!scanDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Scan not found');
    }
    
    const scanData = scanDoc.data();
    
    // Generate glucose prediction
    const prediction = predictGlucose(scanData.nutritionalInfo);
    
    // Generate advice based on prediction
    const advice = generateAdvice(prediction, scanData.nutritionalInfo);
    
    // Update scan with prediction and advice
    await admin.firestore().collection('users').doc(userId)
      .collection('scans').doc(scanId).update({
        glucosePrediction: prediction,
        metabolicAdvice: advice,
        premiumProcessedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    
    return {
      prediction,
      advice
    };
  } catch (error) {
    console.error('Error predicting glucose response:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get metabolic advice for a scan
exports.getMetabolicAdvice = functions.https.onCall(async (data, context) => {
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
    // Check if user is premium
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    const userData = userDoc.data();
    if (!userData.isPremium) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Premium subscription required for this feature'
      );
    }
    
    // Get scan data
    const scanDoc = await admin.firestore().collection('users').doc(userId)
      .collection('scans').doc(scanId).get();
    
    if (!scanDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Scan not found');
    }
    
    const scanData = scanDoc.data();
    
    // If scan already has metabolic advice, return it
    if (scanData.metabolicAdvice) {
      return scanData.metabolicAdvice;
    }
    
    // If scan has glucose prediction but no advice, generate advice
    if (scanData.glucosePrediction) {
      const advice = generateAdvice(scanData.glucosePrediction, scanData.nutritionalInfo);
      
      // Update scan with advice
      await admin.firestore().collection('users').doc(userId)
        .collection('scans').doc(scanId).update({
          metabolicAdvice: advice,
          premiumProcessedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      
      return advice;
    }
    
    // If scan has neither prediction nor advice, generate both
    const prediction = predictGlucose(scanData.nutritionalInfo);
    const advice = generateAdvice(prediction, scanData.nutritionalInfo);
    
    // Update scan with prediction and advice
    await admin.firestore().collection('users').doc(userId)
      .collection('scans').doc(scanId).update({
        glucosePrediction: prediction,
        metabolicAdvice: advice,
        premiumProcessedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    
    return advice;
  } catch (error) {
    console.error('Error getting metabolic advice:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to predict glucose response
// In a production app, this would use a trained ML model
function predictGlucose(nutritionInfo) {
  // This is a simplified algorithm for demonstration purposes
  // In a real app, you would use a proper ML model trained on real data
  
  // Extract relevant nutritional information
  const { calories, carbs, protein, fat, microNutrients } = nutritionInfo;
  const { fiber, sugar } = microNutrients;
  
  // Calculate glycemic load (simplified)
  // Higher carbs and sugar increase glucose response
  // Higher fiber, protein, and fat reduce glucose response
  const baseResponse = carbs * 0.2 + sugar * 0.3;
  const modifiers = fiber * -0.2 + protein * -0.1 + fat * -0.05;
  const peakValue = Math.max(80, Math.min(180, 100 + baseResponse + modifiers));
  
  // Generate time points (0 to 3 hours, in 10-minute intervals)
  const timePoints = Array.from({ length: 19 }, (_, i) => i * 10);
  
  // Generate glucose values
  const values = timePoints.map(time => {
    if (time === 0) {
      return 80; // Starting glucose level
    } else if (time <= 40) {
      // Rising phase
      return 80 + (peakValue - 80) * (time / 40);
    } else if (time <= 120) {
      // Falling phase
      const fallRatio = (time - 40) / 80;
      return peakValue - (peakValue - 80) * fallRatio;
    } else {
      // Stabilization phase
      return 80 + (Math.random() * 5);
    }
  });
  
  return {
    timePoints,
    values,
    peakValue,
    peakTime: 40 // Peak at 40 minutes
  };
}

// Function to generate advice based on glucose prediction
function generateAdvice(prediction, nutritionInfo) {
  const { peakValue } = prediction;
  const { carbs, protein, fat, microNutrients } = nutritionInfo;
  const { fiber, sugar } = microNutrients;
  
  // Determine impact level
  let impact;
  if (peakValue < 110) {
    impact = "Low glycemic impact. This meal should have minimal effect on your blood sugar levels.";
  } else if (peakValue < 140) {
    impact = "Moderate glycemic impact. This meal may cause a noticeable but manageable rise in blood sugar.";
  } else {
    impact = "High glycemic impact. This meal could cause a significant spike in blood sugar levels.";
  }
  
  // Generate tips based on nutritional content
  const tips = [];
  
  if (carbs > 30) {
    tips.push("Reduce portion size to lower the carbohydrate load.");
  }
  
  if (sugar > 15) {
    tips.push("This meal is high in sugar. Consider a lower-sugar alternative next time.");
  }
  
  if (fiber < 5 && carbs > 20) {
    tips.push("Add more fiber to slow down glucose absorption. Consider adding vegetables or whole grains.");
  }
  
  if (peakValue > 130) {
    tips.push("Take a 10-15 minute walk after eating to help lower the glucose response.");
  }
  
  // Always add some general advice
  tips.push("Drink water before and during your meal to help moderate glucose absorption.");
  
  if (tips.length < 3) {
    tips.push("Pair carbohydrates with protein and healthy fats to slow down glucose absorption.");
  }
  
  return {
    impact,
    tips
  };
}
```

## Step 2: Create Premium Features Service for Frontend

Create a file called `premium-service.js` in your frontend code:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase-config';

const functions = getFunctions(app);

// Predict glucose response
export const predictGlucoseResponse = async (scanId) => {
  try {
    const predictGlucoseFn = httpsCallable(functions, 'predictGlucoseResponse');
    const result = await predictGlucoseFn({ scanId });
    return result.data;
  } catch (error) {
    console.error('Error predicting glucose response:', error);
    throw error;
  }
};

// Get metabolic advice
export const getMetabolicAdvice = async (scanId) => {
  try {
    const getAdviceFn = httpsCallable(functions, 'getMetabolicAdvice');
    const result = await getAdviceFn({ scanId });
    return result.data;
  } catch (error) {
    console.error('Error getting metabolic advice:', error);
    throw error;
  }
};

// Check if user has premium access
export const checkPremiumAccess = async () => {
  try {
    // This would typically call a Cloud Function
    // For now, we'll check the user document directly
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const { getAuth } = await import('firebase/auth');
    
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    if (!auth.currentUser) {
      return false;
    }
    
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    
    if (!userDoc.exists()) {
      return false;
    }
    
    return userDoc.data().isPremium === true;
  } catch (error) {
    console.error('Error checking premium access:', error);
    return false;
  }
};
```

## Step 3: Implement Premium Features UI Components

Create components to display premium features:

### Glucose Prediction Chart Component

```javascript
// Example React component for glucose prediction chart
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const GlucosePredictionChart = ({ prediction }) => {
  if (!prediction || !prediction.timePoints || !prediction.values) {
    return <div>No prediction data available</div>;
  }
  
  // Format data for chart
  const data = prediction.timePoints.map((time, index) => ({
    time: `${time}m`,
    glucose: prediction.values[index]
  }));
  
  return (
    <div>
      <h3>Predicted Glucose Response</h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" label={{ value: 'Time (minutes)', position: 'bottom' }} />
            <YAxis label={{ value: 'Glucose (mg/dL)', angle: -90, position: 'left' }} domain={[70, 200]} />
            <Tooltip />
            <Line type="monotone" dataKey="glucose" stroke="#8884d8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p>Peak Value: {prediction.peakValue} mg/dL at {prediction.peakTime} minutes</p>
      </div>
    </div>
  );
};

export default GlucosePredictionChart;
```

### Metabolic Advice Component

```javascript
// Example React component for metabolic advice
import React from 'react';

const MetabolicAdvice = ({ advice }) => {
  if (!advice) {
    return <div>No advice available</div>;
  }
  
  return (
    <div>
      <h3>Metabolic Impact</h3>
      <p>{advice.impact}</p>
      
      <h4>Tips to Improve Metabolic Response:</h4>
      <ul>
        {advice.tips.map((tip, index) => (
          <li key={index}>{tip}</li>
        ))}
      </ul>
    </div>
  );
};

export default MetabolicAdvice;
```

### Premium Features Container Component

```javascript
// Example React component for premium features container
import React, { useState, useEffect } from 'react';
import { predictGlucoseResponse, getMetabolicAdvice, checkPremiumAccess } from './premium-service';
import GlucosePredictionChart from './GlucosePredictionChart';
import MetabolicAdvice from './MetabolicAdvice';

const PremiumFeatures = ({ scanId }) => {
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const hasPremium = await checkPremiumAccess();
        setIsPremium(hasPremium);
        
        if (hasPremium && scanId) {
          await loadPremiumFeatures();
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error checking premium access:', error);
        setError('Failed to check premium access');
        setLoading(false);
      }
    };
    
    checkAccess();
  }, [scanId]);
  
  const loadPremiumFeatures = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get glucose prediction
      const predictionResult = await predictGlucoseResponse(scanId);
      setPrediction(predictionResult.prediction);
      setAdvice(predictionResult.advice);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading premium features:', error);
      setError('Failed to load premium features');
      setLoading(false);
    }
  };
  
  if (loading) {
    return <div>Loading premium features...</div>;
  }
  
  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }
  
  if (!isPremium) {
    return (
      <div>
        <h3>Premium Features</h3>
        <p>Upgrade to premium to access glucose prediction and metabolic advice.</p>
        <button>Upgrade to Premium</button>
      </div>
    );
  }
  
  return (
    <div>
      <h2>Premium Analysis</h2>
      <GlucosePredictionChart prediction={prediction} />
      <MetabolicAdvice advice={advice} />
    </div>
  );
};

export default PremiumFeatures;
```

## Step 4: Update Functions Index

Update your `functions/index.js` to include the premium functions:

```javascript
// Add these if not already included
exports.predictGlucoseResponse = premiumFunctions.predictGlucoseResponse;
exports.getMetabolicAdvice = premiumFunctions.getMetabolicAdvice;
```

## Step 5: Implement Premium Access Control

Create a higher-order component to protect premium features:

```javascript
// Example React HOC for premium access control
import React, { useState, useEffect } from 'react';
import { checkPremiumAccess } from './premium-service';

const withPremiumAccess = (WrappedComponent) => {
  return (props) => {
    const [loading, setLoading] = useState(true);
    const [isPremium, setIsPremium] = useState(false);
    const [error, setError] = useState(null);
    
    useEffect(() => {
      const checkAccess = async () => {
        try {
          const hasPremium = await checkPremiumAccess();
          setIsPremium(hasPremium);
        } catch (error) {
          console.error('Error checking premium access:', error);
          setError('Failed to check premium access');
        } finally {
          setLoading(false);
        }
      };
      
      checkAccess();
    }, []);
    
    if (loading) {
      return <div>Checking premium access...</div>;
    }
    
    if (error) {
      return <div style={{ color: 'red' }}>{error}</div>;
    }
    
    if (!isPremium) {
      return (
        <div>
          <h3>Premium Feature</h3>
          <p>This feature requires a premium subscription.</p>
          <button>Upgrade to Premium</button>
        </div>
      );
    }
    
    return <WrappedComponent {...props} />;
  };
};

export default withPremiumAccess;

// Usage example:
// const PremiumComponent = withPremiumAccess(YourComponent);
```

## Step 6: Deploy Premium Fu
(Content truncated due to size limit. Use line ranges to read in chunks)