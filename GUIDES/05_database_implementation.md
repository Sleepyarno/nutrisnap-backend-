# Database Implementation

This document provides step-by-step instructions for implementing the database structure in the NutriSnap app using Firestore.

## Step 1: Design Database Schema

The NutriSnap app uses the following Firestore collections and documents:

### Users Collection
```
users/{userId}
  - email: string
  - displayName: string
  - createdAt: timestamp
  - updatedAt: timestamp
  - isPremium: boolean
  - preferences: {
      notifications: boolean,
      darkMode: boolean
    }
  - subscriptionDetails: {
      platform: string (ios/android)
      productId: string
      expirationDate: timestamp
      isActive: boolean
      autoRenewing: boolean
      updatedAt: timestamp
    }
```

### Scans Subcollection
```
# Firestore Database Schema

## 1. users Collection
Each document represents a user, keyed by their UID.

**Path:** `users/{userId}`

**Fields:**
- `email`: string
- `displayName`: string
- `createdAt`: timestamp
- `premium`: boolean
- `subscription`: map (provider, status, renewal date, etc.)
- (any other profile fields)

### Subcollection: scans
Stores each food scan for the user.

**Path:** `users/{userId}/scans/{scanId}`

**Fields:**
- `imageUrl`: string
- `timestamp`: timestamp
- `status`: string (`processing`, `completed`, `error`)
- `detectedItems`: array of maps (`[{ name, confidence }]`)
- `nutritionalInfo`: map (see below)
- `glucosePrediction`: map (premium only)
  - `timePoints`: number[]
  - `values`: number[]
  - `peakValue`: number
  - `peakTime`: number
- `metabolicAdvice`: map (premium only)
  - `impact`: string
  - `tips`: string[]
- `error`: string (optional, if status is `error`)
- `completedAt`: timestamp

**nutritionalInfo map:**
- `calories`: number
- `protein`: number
- `carbs`: number
- `fat`: number
- `microNutrients`: map (`fiber`, `sugar`, `sodium`, `potassium`, etc.)

---

## 2. foods Collection (Reference Database)
**Path:** `foods/{foodId}`

**Fields:**
- `name`: string
- `nutritionalInfo`: map (same structure as above)
- `aliases`: array of strings (for search)
- `imageUrl`: string (optional)
- `createdBy`: userId (if user-generated)
- `verified`: boolean

---

## 3. payments Collection (for premium features)
**Path:** `payments/{paymentId}`

**Fields:**
- `userId`: string
- `amount`: number
- `timestamp`: timestamp
- `status`: string
- `provider`: string

---

## Example Document Structure

```
users/
  {userId}/
    displayName: "Alice"
    email: "alice@email.com"
    premium: true
    createdAt: <timestamp>
    scans/
      {scanId}/
        imageUrl: "https://..."
        timestamp: <timestamp>
        status: "completed"
        detectedItems: [{ name: "Apple", confidence: 0.98 }]
        nutritionalInfo: { calories: 95, protein: 0.5, ... }
        glucosePrediction: { timePoints: [...], values: [...], peakValue: 145, peakTime: 60 }
        metabolicAdvice: { impact: "moderate", tips: ["Eat with protein"] }
        completedAt: <timestamp>
foods/
  {foodId}/
    name: "Apple"
    nutritionalInfo: { calories: 95, ... }
    aliases: ["apple", "apples"]
    verified: true
payments/
  {paymentId}/
    userId: "{userId}"
    amount: 4.99
    timestamp: <timestamp>
    status: "success"
    provider: "stripe"
```

---

# Firestore Security Rules Example

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /scans/{scanId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    match /foods/{foodId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /payments/{paymentId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

---

# Backend Logic

## Creating and Updating Scan Records
- When a scan is initiated, create a new document in `users/{userId}/scans/` with `status: processing`.
- After analysis, update the document with `detectedItems`, `nutritionalInfo`, and set `status: completed`.
- If premium, add `glucosePrediction` and `metabolicAdvice` fields.
- On error, update `status: error` and add an `error` message.

## Retrieving Scan History
- Query `users/{userId}/scans` ordered by `timestamp` (limit as needed).

## Storing/Retrieving Premium Feature Results
- Store premium data in the scan document as shown above.
- Retrieve as part of the scan record.

---

# Frontend Integration
- Use Firebase SDK to call backend functions and read/write to Firestore.
- Ensure frontend expects and handles all documented fields, including premium fields (if user is premium).
- Use security rules to restrict access.

---

# Testing
- Add unit/integration tests for backend logic (scan creation, update, error handling).
- Add frontend tests to verify correct data flow and UI updates.
- Test edge cases: missing fields, premium vs. non-premium users, unauthorized access.


### Subscriptions Subcollection
```
users/{userId}/subscriptions/{platform}
  - platform: string (ios/android)
  - productId: string
  - purchaseToken: string (Android) or receiptData: string (iOS)
  - originalTransactionId: string
  - purchaseDate: timestamp
  - expirationDate: timestamp
  - isActive: boolean
  - autoRenewing: boolean
  - updatedAt: timestamp
```

### Transactions Subcollection
```
users/{userId}/transactions/{transactionId}
  - platform: string (ios/android)
  - productId: string
  - transactionId: string
  - originalTransactionId: string
  - purchaseDate: timestamp
  - amount: number
  - currency: string
  - status: string (completed, refunded, failed)
  - createdAt: timestamp
```

### Nutritional Data Collection
```
nutritionalData/{foodId}
  - name: string
  - category: string
  - calories: number
  - protein: number
  - carbs: number
  - fat: number
  - microNutrients: {
      fiber: number,
      sugar: number,
      sodium: number,
      potassium: number,
      // other micronutrients
    }
```

## Step 2: Create Database Service for Frontend

Create a file called `database-service.js` in your frontend code:

```javascript
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { app } from './firebase-config';

const db = getFirestore(app);

// User profile functions
export const getUserProfile = async (userId) => {
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      throw new Error('User profile not found');
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

export const updateUserProfile = async (userId, data) => {
  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

// Scan functions
export const getScan = async (userId, scanId) => {
  try {
    const docRef = doc(db, 'users', userId, 'scans', scanId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Scan not found');
    }
  } catch (error) {
    console.error('Error getting scan:', error);
    throw error;
  }
};

export const getScanHistory = async (userId, limitCount = 10) => {
  try {
    const scansRef = collection(db, 'users', userId, 'scans');
    const q = query(scansRef, orderBy('timestamp', 'desc'), limit(limitCount));
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

export const listenToScan = (userId, scanId, callback) => {
  const docRef = doc(db, 'users', userId, 'scans', scanId);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({
        id: docSnap.id,
        ...docSnap.data()
      });
    } else {
      callback(null);
    }
  });
};

// Subscription functions
export const getSubscription = async (userId, platform) => {
  try {
    const docRef = doc(db, 'users', userId, 'subscriptions', platform);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      return null; // No subscription found
    }
  } catch (error) {
    console.error('Error getting subscription:', error);
    throw error;
  }
};

// Transaction functions
export const getTransactionHistory = async (userId, limitCount = 10) => {
  try {
    const transactionsRef = collection(db, 'users', userId, 'transactions');
    const q = query(transactionsRef, orderBy('purchaseDate', 'desc'), limit(limitCount));
    const querySnapshot = await getDocs(q);
    
    const transactions = [];
    querySnapshot.forEach((doc) => {
      transactions.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return transactions;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw error;
  }
};

// Nutritional data functions
export const getNutritionalData = async (foodId) => {
  try {
    const docRef = doc(db, 'nutritionalData', foodId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      throw new Error('Nutritional data not found');
    }
  } catch (error) {
    console.error('Error getting nutritional data:', error);
    throw error;
  }
};

export const searchNutritionalData = async (query, limitCount = 10) => {
  try {
    // This is a simple implementation that searches by name
    // In a production app, you would use Firestore's full-text search capabilities
    // or integrate with a service like Algolia
    const nutritionalDataRef = collection(db, 'nutritionalData');
    const q = query(
      nutritionalDataRef,
      where('name', '>=', query),
      where('name', '<=', query + '\uf8ff'),
      limit(limitCount)
    );
    const querySnapshot = await getDocs(q);
    
    const results = [];
    querySnapshot.forEach((doc) => {
      results.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return results;
  } catch (error) {
    console.error('Error searching nutritional data:', error);
    throw error;
  }
};
```

## Step 3: Create Firestore Indexes

For complex queries, you'll need to create indexes. Create a file called `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "scans",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "purchaseDate", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

## Step 4: Update Firestore Security Rules

Ensure your `firestore.rules` file has the correct security rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User profiles - users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Food scans - users can only access their own scans
      match /scans/{scanId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      // Subscriptions - users can only read their own subscriptions
      match /subscriptions/{subscriptionId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if false; // Only Cloud Functions can write subscriptions
      }
      
      // Transactions - users can only read their own transactions
      match /transactions/{transactionId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if false; // Only Cloud Functions can write transactions
      }
    }
    
    // Public nutritional data - readable by all authenticated users
    match /nutritionalData/{item} {
      allow read: if request.auth != null;
      allow write: if false; // Only admins can write via backend
    }
  }
}
```

## Step 5: Create Seed Data for Nutritional Database

Create a script to seed the nutritional database with some initial data:

```javascript
// functions/scripts/seed-nutritional-data.js

const admin = require('firebase-admin');
const serviceAccount = require('../config/service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const nutritionalData = [
  {
    name: 'Apple',
    category: 'Fruit',
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fat: 0.3,
    microNutrients: {
      fiber: 4,
      sugar: 19,
      sodium: 2,
      potassium: 195
    }
  },
  {
    name: 'Banana',
    category: 'Fruit',
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fat: 0.4,
    microNutrients: {
      fiber: 3.1,
      sugar: 14,
      sodium: 1,
      potassium: 422
    }
  },
  {
    name: 'Chicken Breast',
    category: 'Meat',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    microNutrients: {
      fiber: 0,
      sugar: 0,
      sodium: 74,
      potassium: 256
    }
  },
  // Add more food items as needed
];

async function seedData() {
  try {
    const batch = db.batch();
    
    nutritionalData.forEach((item) => {
      const docRef = db.collection('nutritionalData').doc();
      batch.set(docRef, item);
    });
    
    await batch.commit();
    console.log(`Added ${nutritionalData.length} items to nutritional database`);
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    process.exit();
  }
}

seedData();
```

## Step 6: Create a Script to Run the Seed Data

Add a script to your `functions/package.json`:

```json
"scripts": {
  "seed-nutritional-data": "node scripts/seed-nutritional-data.js"
}
```

## Step 7: Deploy Firestore Rules and Indexes

Deploy your Firestore rules and indexes:

```bash
firebase deploy --only firestore
```

## Step 8: Seed the Nutritional Database

Before running the seed script, you need to get a service account key:

1. Go to Firebase Console > Project Settings > Service accounts
2. Click "Generate new private key"
3. Save the JSON file to `functions/config/service-account.json`

Then run the seed script:

```bash
cd functions
npm run seed-nutritional-data
cd ..
```

## Step 9: Test Database Operations

1. Create a test user and verify the user document is created in Firestore
2. Upload and analyze a food image, then verify the scan document is created
3. Test querying scan history
4. Test the nutritional data search functionality

## Step 10: Implement Data Caching (Optional)

For better performance, implement client-side caching:

```javascript
// Example of a simple cache implementation
const cache = {
  data: {},
  set: function(key, value, ttl = 60000) { // Default TTL: 1 minute
    this.data[key] = {
      value,
      expiry: Date.now() + ttl
    };
  },
  get: function(key) {
    const item = this.data[key];
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      delete this.data[key];
      return null;
    }
    
    return item.value;
  },
  clear: function() {
    this.data = {};
  }
};

// Example of using the cache with nutritional data
export const getNutritionalDataCached = async (foodId) => {
  const cacheKey = `nutritionalData_${foodId}`;
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    return cachedData;
  }
  
  const data = await getNutritionalData(foodId);
  cache.set(cacheKey, data, 3600000); // Cache for 1 hour
  return data;
};
```

## Next Steps

Now that the database implementation is complete, proceed to implementing the [Premium Features](06_premium_features.md) for subscribers.
