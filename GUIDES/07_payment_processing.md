# Payment Processing

This document provides step-by-step instructions for implementing payment processing in the NutriSnap app to monetize premium features through subscriptions.

## Step 1: Create Payment Processing Module

Create a new file `functions/src/payments/subscriptions.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Verify Apple App Store receipt
exports.verifyAppleReceipt = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { receiptData, productId } = data;
  
  if (!receiptData) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Receipt data is required'
    );
  }
  
  try {
    // First try production environment
    let verificationResponse = await verifyWithApple(receiptData, false);
    
    // If status is 21007, it's a sandbox receipt, try sandbox environment
    if (verificationResponse.status === 21007) {
      verificationResponse = await verifyWithApple(receiptData, true);
    }
    
    // Check if verification was successful
    if (verificationResponse.status === 0) {
      // Receipt is valid, check subscription status
      const latestReceiptInfo = verificationResponse.latest_receipt_info;
      
      if (latestReceiptInfo && latestReceiptInfo.length > 0) {
        // Sort by expiration date to get the latest
        const sortedReceipts = latestReceiptInfo.sort((a, b) => 
          parseInt(b.expires_date_ms) - parseInt(a.expires_date_ms)
        );
        
        const latestReceipt = sortedReceipts[0];
        const expirationDate = new Date(parseInt(latestReceipt.expires_date_ms));
        const now = new Date();
        
        // Check if subscription is still valid
        const isActive = expirationDate > now;
        
        // Create or update subscription record
        const subscriptionRef = admin.firestore().collection('users').doc(userId)
          .collection('subscriptions').doc('apple');
        
        await subscriptionRef.set({
          platform: 'ios',
          productId: latestReceipt.product_id,
          originalTransactionId: latestReceipt.original_transaction_id,
          latestTransactionId: latestReceipt.transaction_id,
          purchaseDate: admin.firestore.Timestamp.fromDate(
            new Date(parseInt(latestReceipt.purchase_date_ms))
          ),
          expirationDate: admin.firestore.Timestamp.fromDate(expirationDate),
          isActive: isActive,
          autoRenewing: true,
          latestReceipt: verificationResponse.latest_receipt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update user's premium status
        await admin.firestore().collection('users').doc(userId).update({
          isPremium: isActive,
          subscriptionDetails: {
            platform: 'ios',
            productId: latestReceipt.product_id,
            expirationDate: admin.firestore.Timestamp.fromDate(expirationDate),
            isActive: isActive,
            autoRenewing: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }
        });
        
        // Create transaction record
        await createTransaction(userId, {
          platform: 'ios',
          productId: latestReceipt.product_id,
          transactionId: latestReceipt.transaction_id,
          originalTransactionId: latestReceipt.original_transaction_id,
          purchaseDate: new Date(parseInt(latestReceipt.purchase_date_ms)),
          amount: parseFloat(latestReceipt.price) || 4.99,
          currency: latestReceipt.currency || 'USD',
          status: 'completed'
        });
        
        return {
          isActive,
          expirationDate: expirationDate.toISOString(),
          productId: latestReceipt.product_id
        };
      }
    }
    
    throw new Error(`Receipt verification failed with status: ${verificationResponse.status}`);
  } catch (error) {
    console.error('Error verifying Apple receipt:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Helper function to verify receipt with Apple
async function verifyWithApple(receiptData, isSandbox) {
  const verifyUrl = isSandbox
    ? 'https://sandbox.itunes.apple.com/verifyReceipt'
    : 'https://buy.itunes.apple.com/verifyReceipt';
  
  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'receipt-data': receiptData,
      'password': process.env.APPLE_SHARED_SECRET || 'YOUR_APP_SHARED_SECRET', // Get this from App Store Connect
      'exclude-old-transactions': false
    })
  });
  
  return await response.json();
}

// Verify Google Play purchase
exports.verifyGooglePurchase = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { purchaseToken, productId, packageName } = data;
  
  if (!purchaseToken || !productId || !packageName) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Purchase token, product ID, and package name are required'
    );
  }
  
  try {
    // In a production app, you would use Google's API to verify the purchase
    // This requires setting up a service account and using the Google API Node.js client
    
    // For this example, we'll simulate a successful verification
    // In a real app, replace this with actual Google Play API verification
    
    // Simulate successful verification
    const isActive = true;
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1); // Set to 1 year from now
    
    // Create or update subscription record
    const subscriptionRef = admin.firestore().collection('users').doc(userId)
      .collection('subscriptions').doc('google');
    
    await subscriptionRef.set({
      platform: 'android',
      productId,
      purchaseToken,
      packageName,
      purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
      expirationDate: admin.firestore.Timestamp.fromDate(expirationDate),
      isActive: isActive,
      autoRenewing: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update user's premium status
    await admin.firestore().collection('users').doc(userId).update({
      isPremium: isActive,
      subscriptionDetails: {
        platform: 'android',
        productId,
        expirationDate: admin.firestore.Timestamp.fromDate(expirationDate),
        isActive: isActive,
        autoRenewing: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });
    
    // Create transaction record
    await createTransaction(userId, {
      platform: 'android',
      productId,
      transactionId: purchaseToken.substring(0, 20), // Use part of token as transaction ID
      purchaseDate: new Date(),
      amount: productId.includes('yearly') ? 49.99 : 4.99,
      currency: 'USD',
      status: 'completed'
    });
    
    return {
      isActive,
      expirationDate: expirationDate.toISOString(),
      productId
    };
  } catch (error) {
    console.error('Error verifying Google purchase:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Check subscription status
exports.checkSubscriptionStatus = functions.https.onCall(async (data, context) => {
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
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    const isPremium = userData.isPremium || false;
    const subscriptionDetails = userData.subscriptionDetails || null;
    
    // If user has subscription details, check if it's still valid
    if (subscriptionDetails && subscriptionDetails.expirationDate) {
      const expirationDate = subscriptionDetails.expirationDate.toDate();
      const now = new Date();
      
      // If subscription has expired, update status
      if (expirationDate < now && isPremium) {
        await admin.firestore().collection('users').doc(userId).update({
          isPremium: false,
          'subscriptionDetails.isActive': false,
          'subscriptionDetails.updatedAt': admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update subscription document
        const subscriptionRef = admin.firestore().collection('users').doc(userId)
          .collection('subscriptions').doc(subscriptionDetails.platform === 'ios' ? 'apple' : 'google');
        
        const subscriptionDoc = await subscriptionRef.get();
        if (subscriptionDoc.exists) {
          await subscriptionRef.update({
            isActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        return {
          isActive: false,
          expirationDate: expirationDate.toISOString(),
          productId: subscriptionDetails.productId
        };
      }
    }
    
    return {
      isActive: isPremium,
      expirationDate: subscriptionDetails?.expirationDate?.toDate()?.toISOString() || null,
      productId: subscriptionDetails?.productId || null
    };
  } catch (error) {
    console.error('Error checking subscription status:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get subscription products
exports.getSubscriptionProducts = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  // Return product information
  // In a real app, you might fetch this from a database
  return {
    products: [
      {
        id: 'com.yourcompany.nutrisnap.premium.monthly',
        type: 'subscription',
        title: 'Monthly Premium',
        description: 'Access to all premium features including glucose prediction',
        price: 4.99,
        currency: 'USD',
        period: 'month'
      },
      {
        id: 'com.yourcompany.nutrisnap.premium.yearly',
        type: 'subscription',
        title: 'Annual Premium',
        description: 'Access to all premium features including glucose prediction (Save 16%)',
        price: 49.99,
        currency: 'USD',
        period: 'year'
      }
    ]
  };
});

// Get transaction history
exports.getTransactionHistory = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { limit = 10 } = data;
  
  try {
    const transactionsRef = admin.firestore().collection('users').doc(userId)
      .collection('transactions');
    
    const snapshot = await transactionsRef
      .orderBy('purchaseDate', 'desc')
      .limit(limit)
      .get();
    
    const transactions = [];
    snapshot.forEach(doc => {
      transactions.push({
        id: doc.id,
        ...doc.data(),
        purchaseDate: doc.data().purchaseDate.toDate().toISOString()
      });
    });
    
    return { transactions };
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Helper function to create transaction record
async function createTransaction(userId, transactionData) {
  try {
    await admin.firestore().collection('users').doc(userId)
      .collection('transactions').add({
        ...transactionData,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
  } catch (error) {
    console.error('Error creating transaction record:', error);
    // Don't throw here, as this is a helper function
  }
}
```

## Step 2: Update Package.json

Add the node-fetch package to your dependencies:

```bash
cd functions
npm install node-fetch@2
cd ..
```

Note: We're using node-fetch v2 because v3 is ESM-only and requires additional configuration.

## Step 3: Update Functions Index

Update your `functions/index.js` to include the payment functions:

```javascript
const paymentFunctions = require('./src/payments/subscriptions');

// Export payment functions
exports.verifyAppleReceipt = paymentFunctions.verifyAppleReceipt;
exports.verifyGooglePurchase = paymentFunctions.verifyGooglePurchase;
exports.checkSubscriptionStatus = paymentFunctions.checkSubscriptionStatus;
exports.getSubscriptionProducts = paymentFunctions.getSubscriptionProducts;
exports.getTransactionHistory = paymentFunctions.getTransactionHistory;
```

## Step 4: Create Payment Service for Frontend

Create a file called `payment-service.js` in your frontend code:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase-config';

const functions = getFunctions(app);

// Get subscription products
export const getSubscriptionProducts = async () => {
  try {
    const getProductsFn = httpsCallable(functions, 'getSubscriptionProducts');
    const result = await getProductsFn();
    return result.data.products;
  } catch (error) {
    console.error('Error getting subscription products:', error);
    throw error;
  }
};

// Verify Apple receipt
export const verifyAppleReceipt = async (receiptData, productId) => {
  try {
    const verifyReceiptFn = httpsCallable(functions, 'verifyAppleReceipt');
    const result = await verifyReceiptFn({ receiptData, productId });
    return result.data;
  } catch (error) {
    console.error('Error verifying Apple receipt:', error);
    throw error;
  }
};

// Verify Google purchase
export const verifyGooglePurchase = async (purchaseToken, productId, packageName) => {
  try {
    const verifyPurchaseFn = httpsCallable(functions, 'verifyGooglePurchase');
    const result = await verifyPurchaseFn({ purchaseToken, productId, packageName });
    return result.data;
  } catch (error) {
    console.error('Error verifying Google purchase:', error);
    throw error;
  }
};

// Check subscription status
export const checkSubscriptionStatus = async () => {
  try {
    const checkStatusFn = httpsCallable(functions, 'checkSubscriptionStatus');
    const result = await checkStatusFn();
    return result.data;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    throw error;
  }
};

// Get transaction history
export const getTransactionHistory = async (limit = 10) => {
  try {
    const getHistoryFn = httpsCallable(functions, 'getTransactionHistory');
    const result = await getHistoryFn({ limit });
    return result.data.transactions;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw error;
  }
};
```

## Step 5: Implement Platform-Specific Payment Handlers

### iOS (StoreKit) Implementation

Create a file called `apple-payment-handler.js` in your frontend code:

```javascript
import { verifyAppleReceipt } from './payment-service';

// Initialize StoreKit
export const initializeStoreKit = () => {
  // This would be implemented using the StoreKit JS bridge
  // For a real implementation, you would use a library like react-native-iap
  console.log('StoreKit initialized');
};

// Get available products
export const getAvailableProducts = asyn
(Content truncated due to size limit. Use line ranges to read in chunks)