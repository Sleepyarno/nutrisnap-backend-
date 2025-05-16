# Testing & Deployment

This document provides step-by-step instructions for testing and deploying the NutriSnap app.

## Step 1: Set Up Testing Environment

### Create Test Configuration

Create a file called `src/config/test-config.js` for testing:

```javascript
// Test configuration
export const TEST_CONFIG = {
  useEmulators: true,
  emulatorHost: 'localhost',
  authEmulatorPort: 9099,
  firestoreEmulatorPort: 8080,
  functionsEmulatorPort: 5001,
  storageEmulatorPort: 9199
};
```

### Create Test Utilities

Create a file called `src/utils/test-utils.js`:

```javascript
import { auth, db, functions, storage } from '../firebase-config';
import { TEST_CONFIG } from '../config/test-config';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator } from 'firebase/functions';
import { connectStorageEmulator } from 'firebase/storage';

// Connect to Firebase emulators for testing
export const connectToEmulators = () => {
  if (TEST_CONFIG.useEmulators) {
    connectAuthEmulator(auth, `http://${TEST_CONFIG.emulatorHost}:${TEST_CONFIG.authEmulatorPort}`);
    connectFirestoreEmulator(db, TEST_CONFIG.emulatorHost, TEST_CONFIG.firestoreEmulatorPort);
    connectFunctionsEmulator(functions, TEST_CONFIG.emulatorHost, TEST_CONFIG.functionsEmulatorPort);
    connectStorageEmulator(storage, TEST_CONFIG.emulatorHost, TEST_CONFIG.storageEmulatorPort);
    
    console.log('Connected to Firebase emulators');
  }
};

// Create test user
export const createTestUser = async (email, password, displayName) => {
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    await userCredential.user.updateProfile({ displayName });
    return userCredential.user;
  } catch (error) {
    console.error('Error creating test user:', error);
    throw error;
  }
};

// Clean up test data
export const cleanupTestData = async (userId) => {
  try {
    // Delete user's scans
    const scansSnapshot = await db.collection('users').doc(userId).collection('scans').get();
    const batch = db.batch();
    
    scansSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Delete user's subscriptions
    const subscriptionsSnapshot = await db.collection('users').doc(userId).collection('subscriptions').get();
    
    subscriptionsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Delete user's transactions
    const transactionsSnapshot = await db.collection('users').doc(userId).collection('transactions').get();
    
    transactionsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Delete user document
    batch.delete(db.collection('users').doc(userId));
    
    await batch.commit();
    
    // Delete user authentication
    await auth.currentUser.delete();
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    throw error;
  }
};
```

## Step 2: Create Unit Tests

### Set Up Testing Framework

Install Jest and React Native Testing Library:

```bash
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native
```

Create a Jest configuration file `jest.config.js`:

```javascript
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-vector-icons)/)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};
```

### Create Authentication Tests

Create a file called `__tests__/auth-service.test.js`:

```javascript
import { registerUser, loginUser, logoutUser } from '../src/services/auth-service';
import { connectToEmulators, cleanupTestData } from '../src/utils/test-utils';
import { auth } from '../src/firebase-config';

// Connect to emulators before tests
beforeAll(() => {
  connectToEmulators();
});

// Clean up after tests
afterAll(async () => {
  if (auth.currentUser) {
    await cleanupTestData(auth.currentUser.uid);
  }
});

describe('Authentication Service', () => {
  const testEmail = 'test@example.com';
  const testPassword = 'Test123!';
  const testDisplayName = 'Test User';
  
  test('should register a new user', async () => {
    const user = await registerUser(testEmail, testPassword, testDisplayName);
    
    expect(user).toBeDefined();
    expect(user.email).toBe(testEmail);
  });
  
  test('should login a user', async () => {
    await logoutUser();
    
    const user = await loginUser(testEmail, testPassword);
    
    expect(user).toBeDefined();
    expect(user.email).toBe(testEmail);
  });
  
  test('should logout a user', async () => {
    await logoutUser();
    
    expect(auth.currentUser).toBeNull();
  });
});
```

### Create Food Detection Tests

Create a file called `__tests__/food-detection-service.test.js`:

```javascript
import { analyzeFoodImage, getFoodScanResult } from '../src/services/food-detection-service';
import { connectToEmulators, createTestUser, cleanupTestData } from '../src/utils/test-utils';
import { auth } from '../src/firebase-config';

// Connect to emulators before tests
beforeAll(async () => {
  connectToEmulators();
  await createTestUser('food-test@example.com', 'Test123!', 'Food Test User');
});

// Clean up after tests
afterAll(async () => {
  if (auth.currentUser) {
    await cleanupTestData(auth.currentUser.uid);
  }
});

describe('Food Detection Service', () => {
  // Mock image URL for testing
  const testImageUrl = 'https://example.com/test-food-image.jpg';
  let scanId;
  
  test('should analyze a food image', async () => {
    const result = await analyzeFoodImage(testImageUrl);
    
    expect(result).toBeDefined();
    expect(result.scanId).toBeDefined();
    expect(result.detectedItems).toBeDefined();
    expect(result.nutritionalInfo).toBeDefined();
    
    scanId = result.scanId;
  });
  
  test('should get food scan result', async () => {
    if (!scanId) {
      throw new Error('Scan ID not available');
    }
    
    const result = await getFoodScanResult(scanId);
    
    expect(result).toBeDefined();
    expect(result.detectedItems).toBeDefined();
    expect(result.nutritionalInfo).toBeDefined();
  });
});
```

### Create Component Tests

Create a file called `__tests__/components/ImageUpload.test.js`:

```javascript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ImageUpload from '../../src/components/ImageUpload';

describe('ImageUpload Component', () => {
  test('renders correctly', () => {
    const { getByText } = render(<ImageUpload onUploadComplete={() => {}} />);
    
    expect(getByText('Upload')).toBeDefined();
  });
  
  test('shows error when uploading without file', () => {
    const { getByText, queryByText } = render(<ImageUpload onUploadComplete={() => {}} />);
    
    fireEvent.press(getByText('Upload'));
    
    expect(queryByText('Please select a file first')).toBeDefined();
  });
});
```

## Step 3: Create Integration Tests

Create a file called `__tests__/integration/food-analysis-flow.test.js`:

```javascript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { PremiumProvider } from '../../src/contexts/PremiumContext';
import ScanScreen from '../../src/screens/ScanScreen';
import ResultsScreen from '../../src/screens/ResultsScreen';
import { connectToEmulators, createTestUser, cleanupTestData } from '../../src/utils/test-utils';
import { auth } from '../../src/firebase-config';

// Mock navigation
const mockNavigation = {
  navigate: jest.fn()
};

// Mock route for ResultsScreen
const mockRoute = {
  params: {
    scanId: 'test-scan-id'
  }
};

// Connect to emulators before tests
beforeAll(async () => {
  connectToEmulators();
  await createTestUser('integration-test@example.com', 'Test123!', 'Integration Test User');
});

// Clean up after tests
afterAll(async () => {
  if (auth.currentUser) {
    await cleanupTestData(auth.currentUser.uid);
  }
});

describe('Food Analysis Flow', () => {
  test('ScanScreen navigates to ResultsScreen after analysis', async () => {
    // Mock successful image picker
    jest.mock('expo-image-picker', () => ({
      launchImageLibraryAsync: jest.fn().mockResolvedValue({
        cancelled: false,
        uri: 'file:///test/image.jpg'
      }),
      MediaTypeOptions: {
        Images: 'images'
      }
    }));
    
    // Mock successful upload and analysis
    jest.mock('../../src/api', () => ({
      uploadImage: jest.fn().mockResolvedValue({
        downloadURL: 'https://example.com/test-image.jpg'
      }),
      analyzeFoodImage: jest.fn().mockResolvedValue({
        scanId: 'test-scan-id'
      })
    }));
    
    const { getByText } = render(
      <AuthProvider>
        <ScanScreen navigation={mockNavigation} />
      </AuthProvider>
    );
    
    // Pick image
    fireEvent.press(getByText('Pick from Gallery'));
    
    // Wait for image to be set
    await waitFor(() => {
      expect(getByText('Analyze Food')).toBeDefined();
    });
    
    // Analyze food
    fireEvent.press(getByText('Analyze Food'));
    
    // Wait for navigation
    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Results', { scanId: 'test-scan-id' });
    });
  });
  
  test('ResultsScreen displays food analysis results', async () => {
    // Mock food scan result
    jest.mock('../../src/api', () => ({
      getFoodScanResult: jest.fn().mockResolvedValue({
        imageUrl: 'https://example.com/test-image.jpg',
        detectedItems: [
          { name: 'Apple', confidence: 0.95 }
        ],
        nutritionalInfo: {
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
        }
      })
    }));
    
    const { getByText } = render(
      <AuthProvider>
        <PremiumProvider>
          <ResultsScreen route={mockRoute} />
        </PremiumProvider>
      </AuthProvider>
    );
    
    // Wait for results to load
    await waitFor(() => {
      expect(getByText('Food Analysis Results')).toBeDefined();
      expect(getByText('Apple (95% confidence)')).toBeDefined();
      expect(getByText('Calories: 95 kcal')).toBeDefined();
    });
  });
});
```

## Step 4: Run Tests

Add test scripts to your `package.json`:

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

Run the tests:

```bash
npm test
```

## Step 5: Set Up Continuous Integration

### Create GitHub Actions Workflow

Create a file called `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Set up Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Start Firebase emulators
      run: npx firebase emulators:start --only auth,firestore,functions,storage &
      
    - name: Wait for emulators
      run: sleep 10
      
    - name: Run tests
      run: npm test
```

## Step 6: Prepare for Production Deployment

### Create Production Configuration

Create a file called `src/config/prod-config.js`:

```javascript
// Production configuration
export const PROD_CONFIG = {
  region: 'us-central1',
  apiUrl: 'https://us-central1-your-project-id.cloudfunctions.net',
  storageBucket: 'your-project-id.appspot.com'
};
```

### Update Firebase Configuration

Update your `src/firebase-config.js` to use different configurations based on environment:

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAnalytics } from 'firebase/analytics';
import { TEST_CONFIG } from './config/test-config';
import { PROD_CONFIG } from './config/prod-config';

// Determine environment
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const analytics = isProduction ? getAnalytics(app) : null;

// Connect to emulators in test environment
if (isTest && TEST_CONFIG.useEmulators) {
  const { connectToEmulators } = require('./utils/test-utils');
  connectToEmulators();
}

// Set region for functions in production
if (isProduction) {
  functions.region = PROD_CONFIG.region;
}
```

## Step 7: Create Build Scripts

### Add Build Scripts to package.json

```json
"scripts": {
  "build:android": "react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res",
  "build:ios": "react-native bundle --platform ios --dev false --entry-file index.js --bundle-output ios/main.jsbundle --assets-dest ios",
  "build:web": "expo build:web"
}
```

## Step 8: Deploy Firebase Backend

### Deploy Firestore Rules and Indexes

```bash
firebase deploy --only firestore
```

### Deploy Storage Rules

```bash
firebase deploy --only storage
```

### Deploy Cloud Functions

```bash
firebase deploy --only functions
```

## Step 9: Build and Deploy Mobile App

### Build for Android

1. Generate a signing key:
   ```bash
   keytool -genkeypair -v -keystore nutrisnap.keystore -alias nutrisnap -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Place the keystore file in `android/app`

3. Create a file called `android/gradle.properties` with your signing config:
   ```
   MYAPP_RELEASE_STORE_FILE=nutrisnap.keystore
   MYAPP_RELEASE_KEY_ALIAS=nutrisnap
   MYAPP_RELEASE_STORE_PASSWORD=your_keystore_password
   MYAPP_RELEASE_KEY_PASSWORD=your_key_password
   ```

4. Build the release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

5. The APK will be in `android/app/build/outputs/apk/release/app-release.apk`

### Build for iOS

1. Open the project in Xcode:
   ```bash
   cd ios
   open NutriSnap.xcworkspace
   ```

2. Select "Generic iOS Device" as the build target

3. Go to Product > Archive

4. Once the archive is created, click "Distribute App"

5. Follow the steps to upload to App Store Connect

## Step 10: Submit to App Stores

### Google Play Store Submission

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app
3. Go to "Production" > "Create new release"
4. Upload your APK
5. Fill in the release notes
6. Submit for review

### Apple App Store Submission

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app
3. Create a new version
4. Fill in the version information and screenshots
5. Submit for review

## Step 11: Set Up Monitoring and Analytics

### Configure Firebase Crashlytics

1. Install Crashlytics:
   ```bash
   npm install @react-native-firebase/crashlytics
   ```

2. Add Crashlytics to your app:
   ```javascript
   import crashlytics from '@react-native-firebase/crashlytics';

   // Log user information
   const logUserInfo = (user) => {
     if (user) {
       cr
(Content truncated due to size limit. Use line ranges to read in chunks)