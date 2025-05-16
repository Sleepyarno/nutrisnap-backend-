# Frontend Integration

This document provides step-by-step instructions for integrating the Lovable AI frontend with the Firebase backend in the NutriSnap app.

## Step 1: Export Lovable AI Frontend

1. In Lovable AI, complete your app design
2. Go to the "Export" section
3. Select "React Native" as the export format
4. Download the exported code

## Step 2: Set Up Frontend Project Structure

Create a directory structure for your frontend code:

```bash
mkdir -p NutriSnap/frontend
cd NutriSnap/frontend
```

Extract the Lovable AI export into this directory.

## Step 3: Create Firebase Configuration File

Create a file called `src/firebase-config.js` in your frontend code:

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAnalytics } from 'firebase/analytics';

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
export const analytics = getAnalytics(app);
```

## Step 4: Create Service Layer

Create a services directory to organize your Firebase service integrations:

```bash
mkdir -p src/services
```

Copy the service files you've created in previous steps:

1. `src/services/auth-service.js` (from [Firebase Authentication](02_firebase_authentication.md))
2. `src/services/storage-service.js` (from [Firebase Storage](03_firebase_storage.md))
3. `src/services/food-detection-service.js` (from [Food Detection Service](04_food_detection_service.md))
4. `src/services/database-service.js` (from [Database Implementation](05_database_implementation.md))
5. `src/services/premium-service.js` (from [Premium Features](06_premium_features.md))
6. `src/services/payment-service.js` (from [Payment Processing](07_payment_processing.md))

## Step 5: Create API Layer

Create an API layer to abstract Firebase services:

```javascript
// src/api/index.js

import * as authService from '../services/auth-service';
import * as storageService from '../services/storage-service';
import * as foodService from '../services/food-detection-service';
import * as databaseService from '../services/database-service';
import * as premiumService from '../services/premium-service';
import * as paymentService from '../services/payment-service';

// Authentication
export const registerUser = authService.registerUser;
export const loginUser = authService.loginUser;
export const loginWithGoogle = authService.loginWithGoogle;
export const logoutUser = authService.logoutUser;
export const getCurrentUser = authService.getCurrentUser;
export const onAuthStateChange = authService.onAuthStateChange;
export const getUserProfile = authService.getUserProfile;
export const updateUserProfile = authService.updateUserProfile;

// Storage
export const uploadImage = storageService.uploadImage;
export const uploadImageWithSignedUrl = storageService.uploadImageWithSignedUrl;
export const getImageUrl = storageService.getImageUrl;

// Food Detection
export const analyzefoodimage = foodService.analyzefoodimage;
export const getFoodScanResult = foodService.getFoodScanResult;
export const getScanHistory = foodService.getScanHistory;

// Database
export const getUserData = databaseService.getUserProfile;
export const updateUserData = databaseService.updateUserProfile;
export const getScan = databaseService.getScan;
export const getScanHistory = databaseService.getScanHistory;
export const listenToScan = databaseService.listenToScan;
export const getNutritionalData = databaseService.getNutritionalData;
export const searchNutritionalData = databaseService.searchNutritionalData;

// Premium Features
export const predictGlucoseResponse = premiumService.predictGlucoseResponse;
export const getMetabolicAdvice = premiumService.getMetabolicAdvice;
export const checkPremiumAccess = premiumService.checkPremiumAccess;

// Payment Processing
export const getSubscriptionProducts = paymentService.getSubscriptionProducts;
export const checkSubscriptionStatus = paymentService.checkSubscriptionStatus;
export const getTransactionHistory = paymentService.getTransactionHistory;
```

## Step 6: Create Authentication Context

Create an authentication context to manage user state:

```javascript
// src/contexts/AuthContext.js

import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChange, getUserProfile } from '../api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          const profile = await getUserProfile();
          setUserProfile(profile);
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);
  
  const value = {
    currentUser,
    userProfile,
    isAuthenticated: !!currentUser,
    isPremium: userProfile?.isPremium || false,
    loading
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
```

## Step 7: Create Premium Context

Create a premium context to manage premium features access:

```javascript
// src/contexts/PremiumContext.js

import React, { createContext, useState, useEffect, useContext } from 'react';
import { checkPremiumAccess, checkSubscriptionStatus } from '../api';
import { useAuth } from './AuthContext';

const PremiumContext = createContext();

export const usePremium = () => useContext(PremiumContext);

export const PremiumProvider = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const checkAccess = async () => {
      if (!currentUser) {
        setIsPremium(false);
        setSubscriptionDetails(null);
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // Check premium access
        const hasPremium = await checkPremiumAccess();
        setIsPremium(hasPremium);
        
        // Get subscription details
        const status = await checkSubscriptionStatus();
        setSubscriptionDetails(status);
      } catch (error) {
        console.error('Error checking premium status:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkAccess();
  }, [currentUser, userProfile?.isPremium]);
  
  const value = {
    isPremium,
    subscriptionDetails,
    loading
  };
  
  return (
    <PremiumContext.Provider value={value}>
      {children}
    </PremiumContext.Provider>
  );
};
```

## Step 8: Integrate with Lovable AI Components

### Update App.js

Update the main App.js file to include your contexts:

```javascript
// App.js

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/contexts/AuthContext';
import { PremiumProvider } from './src/contexts/PremiumContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <NavigationContainer>
      <AuthProvider>
        <PremiumProvider>
          <AppNavigator />
        </PremiumProvider>
      </AuthProvider>
    </NavigationContainer>
  );
}
```

### Create Navigation Structure

Create a navigation structure that includes authentication flow:

```javascript
// src/navigation/AppNavigator.js

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';

// Import screens from Lovable AI export
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import ScanScreen from '../screens/ScanScreen';
import ResultsScreen from '../screens/ResultsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const HomeStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen name="Results" component={ResultsScreen} />
  </Stack.Navigator>
);

const ScanStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="Scan" component={ScanScreen} />
    <Stack.Screen name="Results" component={ResultsScreen} />
  </Stack.Navigator>
);

const HistoryStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="History" component={HistoryScreen} />
    <Stack.Screen name="Results" component={ResultsScreen} />
  </Stack.Navigator>
);

const ProfileStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="Profile" component={ProfileScreen} />
    <Stack.Screen name="Subscription" component={SubscriptionScreen} />
  </Stack.Navigator>
);

const MainTabs = () => (
  <Tab.Navigator>
    <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: 'Home' }} />
    <Tab.Screen name="ScanTab" component={ScanStack} options={{ title: 'Scan' }} />
    <Tab.Screen name="HistoryTab" component={HistoryStack} options={{ title: 'History' }} />
    <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
  </Tab.Navigator>
);

const AppNavigator = () => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    // Return a loading screen
    return <LoadingScreen />;
  }
  
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
```

## Step 9: Integrate Authentication with Lovable AI Screens

Update the login and register screens to use your authentication services:

### Login Screen

```javascript
// src/screens/LoginScreen.js

import React, { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { loginUser, loginWithGoogle } from '../api';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    
    try {
      setLoading(true);
      await loginUser(email, password);
      // Navigation will be handled by the AuthContext
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      // Navigation will be handled by the AuthContext
    } catch (error) {
      console.error('Google login error:', error);
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>NutriSnap</Text>
      <Text style={styles.subtitle}>Log in to your account</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      
      <Button
        title={loading ? "Logging in..." : "Log In"}
        onPress={handleLogin}
        disabled={loading}
      />
      
      <TouchableOpacity
        style={styles.googleButton}
        onPress={handleGoogleLogin}
        disabled={loading}
      >
        <Text>Sign in with Google</Text>
      </TouchableOpacity>
      
      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.registerText}>
          Don't have an account? Register
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  googleButton: {
    marginTop: 15,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  registerText: {
    marginTop: 20,
    textAlign: 'center',
    color: 'blue',
  },
});

export default LoginScreen;
```

### Register Screen

```javascript
// src/screens/RegisterScreen.js

import React, { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { registerUser } from '../api';

const RegisterScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleRegister = async () => {
    if (!email || !password || !confirmPassword || !displayName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    try {
      setLoading(true);
      await registerUser(email, password, displayName);
      // Navigation will be handled by the AuthContext
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Registration Failed', error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Sign up to get started</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}

(Content truncated due to size limit. Use line ranges to read in chunks)