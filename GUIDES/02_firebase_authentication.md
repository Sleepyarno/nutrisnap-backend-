# Firebase Authentication

This document provides step-by-step instructions for implementing authentication in the NutriSnap app.

## Step 1: Create Authentication Module

Create a new file `functions/src/auth/auth.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Create user profile after sign up
exports.createUserProfile = functions.auth.user().onCreate(async (user) => {
  try {
    // Create a user document in Firestore
    await admin.firestore().collection('users').doc(user.uid).set({
      email: user.email,
      displayName: user.displayName || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isPremium: false,
      preferences: {
        notifications: true,
        darkMode: false
      }
    });
    
    console.log(`User profile created for ${user.uid}`);
    return null;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
});

// Update user profile
exports.updateUserProfile = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { displayName, preferences } = data;
  
  try {
    const updateData = {};
    
    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }
    
    if (preferences !== undefined) {
      updateData.preferences = preferences;
    }
    
    await admin.firestore().collection('users').doc(userId).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get user profile
exports.getUserProfile = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    return userDoc.data();
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
```

## Step 2: Enable Authentication Methods in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to "Authentication" in the left sidebar
4. Click "Get started"
5. Enable the following sign-in methods:
   - Email/Password (required)
   - Google Sign-In (optional but recommended)

## Step 3: Update Functions Index

Make sure your `functions/index.js` includes the authentication functions:

```javascript
// Add this if not already included
exports.getUserProfile = authFunctions.getUserProfile;
```

## Step 4: Create Authentication Service for Frontend

Create a file called `auth-service.js` in your frontend code:

```javascript
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase-config';

const auth = getAuth(app);
const functions = getFunctions(app);

// Register new user
export const registerUser = async (email, password, displayName) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // User profile will be created by the Cloud Function
    return userCredential.user;
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
};

// Login with email/password
export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
};

// Login with Google
export const loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    return userCredential.user;
  } catch (error) {
    console.error('Error logging in with Google:', error);
    throw error;
  }
};

// Logout
export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
};

// Get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};

// Listen for auth state changes
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// Get user profile
export const getUserProfile = async () => {
  try {
    const getUserProfileFn = httpsCallable(functions, 'getUserProfile');
    const result = await getUserProfileFn();
    return result.data;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

// Update user profile
export const updateUserProfile = async (data) => {
  try {
    const updateUserProfileFn = httpsCallable(functions, 'updateUserProfile');
    const result = await updateUserProfileFn(data);
    return result.data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};
```

## Step 5: Create Firebase Config File

Create a file called `firebase-config.js` in your frontend code:

```javascript
import { initializeApp } from 'firebase/app';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
```

## Step 6: Test Authentication Functions

1. Deploy your functions to test them:
   ```bash
   firebase deploy --only functions:createUserProfile,functions:updateUserProfile,functions:getUserProfile
   ```

2. Or test locally with the emulator:
   ```bash
   firebase emulators:start
   ```

3. Create a test user through the Authentication emulator UI
4. Verify the `createUserProfile` function creates a user document in Firestore

## Step 7: Implement Authentication UI Components

For the frontend, implement the following components:

1. Registration Form
2. Login Form
3. Profile Management
4. Password Reset

These will connect to the authentication service you created.

## Step 8: Implement Authentication Guards

Create an authentication guard to protect routes that require authentication:

```javascript
// Example authentication guard for React Router
const AuthGuard = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setLoading(false);
      if (!user) {
        navigate('/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return user ? children : null;
};
```

## Next Steps

Now that authentication is set up, proceed to implementing [Firebase Storage](03_firebase_storage.md) for handling image uploads.
