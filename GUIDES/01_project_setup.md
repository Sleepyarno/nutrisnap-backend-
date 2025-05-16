# Project Setup

This document provides step-by-step instructions for setting up the NutriSnap project environment using Cursor or WindSurf.

## Prerequisites

- Node.js (v16 or later)
- npm (v8 or later)
- Firebase CLI

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

## Step 2: Create Project Directory

```bash
mkdir NutriSnap
cd NutriSnap
```

## Step 3: Firebase Login

```bash
firebase login
```

## Step 4: Initialize Firebase Project

```bash
firebase init
```

When prompted:
1. Select the following features:
   - Firestore
   - Functions
   - Storage
   - Emulators (recommended for local testing)

2. Select "Create a new project" (or use an existing one if you've already created it in Firebase Console)

3. For Firestore:
   - Use default rules file location
   - Choose "Firestore Native mode"

4. For Functions:
   - Choose JavaScript
   - Say Yes to ESLint
   - Say Yes to installing dependencies with npm

5. For Storage:
   - Use default rules file location

6. For Emulators:
   - Select Auth, Functions, Firestore, and Storage emulators
   - Accept default ports
   - Choose to download emulators

## Step 5: Project Structure Setup

Create the following directory structure:

```bash
mkdir -p functions/src/auth
mkdir -p functions/src/food
mkdir -p functions/src/premium
mkdir -p functions/src/payments
```

## Step 6: Configure Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (if you didn't use an existing one)
3. Note your Project ID for future reference

## Step 7: Update Firebase Configuration

Edit `firebase.json` to include:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "predeploy": [
      "npm --prefix \"$RESOURCE_DIR\" run lint"
    ]
  },
  "storage": {
    "rules": "storage.rules"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "storage": {
      "port": 9199
    },
    "ui": {
      "enabled": true
    }
  }
}
```

## Step 8: Configure Functions Package

Update `functions/package.json` to include necessary dependencies:

```json
{
  "name": "functions",
  "description": "Cloud Functions for NutriSnap",
  "scripts": {
    "lint": "eslint .",
    "serve": "firebase emulators:start --only functions",
    "shell": "firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "16"
  },
  "main": "index.js",
  "dependencies": {
    "@google-cloud/vision": "^3.1.0",
    "firebase-admin": "^11.5.0",
    "firebase-functions": "^4.2.1",
    "node-fetch": "^2.6.7"
  },
  "devDependencies": {
    "eslint": "^8.15.0",
    "eslint-config-google": "^0.14.0",
    "firebase-functions-test": "^3.0.0"
  },
  "private": true
}
```

## Step 9: Install Dependencies

```bash
cd functions
npm install
cd ..
```

## Step 10: Set Up Google Cloud Vision API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Navigate to "APIs & Services" > "Library"
4. Search for "Vision API"
5. Click on "Cloud Vision API"
6. Click "Enable"
7. Create API credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Name: "nutrisnap-vision-api"
   - Role: "Project" > "Editor"
   - Create a JSON key and download it
   - Save the key as `functions/config/vision-api-key.json`

## Step 11: Create Configuration Directory

```bash
mkdir -p functions/config
```

Add the following to `.gitignore`:

```
# Configuration files with sensitive data
functions/config/
```

## Step 12: Create Main Functions Entry Point

Create `functions/index.js`:

```javascript
const admin = require('firebase-admin');
admin.initializeApp();

// Import function modules
const authFunctions = require('./src/auth/auth');
const foodFunctions = require('./src/food/detection');
const premiumFunctions = require('./src/premium/glucose');
const paymentFunctions = require('./src/payments/subscriptions');

// Export all functions
exports.createUserProfile = authFunctions.createUserProfile;
exports.updateUserProfile = authFunctions.updateUserProfile;

exports.analyzefoodimage = foodFunctions.analyzefoodimage;
exports.getFoodScanResult = foodFunctions.getFoodScanResult;

exports.predictGlucoseResponse = premiumFunctions.predictGlucoseResponse;
exports.getMetabolicAdvice = premiumFunctions.getMetabolicAdvice;

exports.verifyAppleReceipt = paymentFunctions.verifyAppleReceipt;
exports.verifyGooglePurchase = paymentFunctions.verifyGooglePurchase;
exports.checkSubscriptionStatus = paymentFunctions.checkSubscriptionStatus;
exports.getSubscriptionProducts = paymentFunctions.getSubscriptionProducts;
exports.getTransactionHistory = paymentFunctions.getTransactionHistory;
```

## Step 13: Set Up Firestore Security Rules

Create `firestore.rules`:

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

## Step 14: Set Up Storage Security Rules

Create `storage.rules`:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User images - users can only access their own images
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Public assets - readable by all users
    match /public/{allPaths=**} {
      allow read: if true;
      allow write: if false; // Only admins can write
    }
  }
}
```

## Step 15: Test Your Setup

Run the Firebase emulators to verify your setup:

```bash
firebase emulators:start
```

You should see the Firebase Emulator UI start up, typically at http://localhost:4000.

## Next Steps

Now that your project is set up, proceed to implementing [Firebase Authentication](02_firebase_authentication.md).
