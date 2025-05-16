const functions = require('firebase-functions');
const admin = require('firebase-admin');

const express = require('express');
const app = express();
app.use(express.json());
const { sendUserNotification } = require('./notifications/fcm');

// HTTPS endpoint for payment provider webhooks (mocked for backend test)
app.post('/', async (req, res) => {
  try {
    // Mocked: In real use, verify signature and parse provider payload
    const { userId, eventType, paymentInfo } = req.body;
    if (!userId || !eventType) {
      return res.status(400).send('Missing userId or eventType');
    }
    const userRef = admin.firestore().collection('users').doc(userId);
    if (eventType === 'payment_success' || eventType === 'payment_renewal') {
      await userRef.set({
        isPremium: true,
        subscriptionDetails: {
          ...(await userRef.get()).exists && (await userRef.get()).data().subscriptionDetails ? (await userRef.get()).data().subscriptionDetails : {},
          isActive: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      }, { merge: true });
      // Send FCM notification if possible
      try {
        const userDoc = await userRef.get();
        if (userDoc.exists && userDoc.data().fcmToken) {
          await sendUserNotification(userId, {
            notification: {
              title: eventType === 'payment_success' ? 'Payment Successful' : 'Subscription Renewed',
              body: eventType === 'payment_success'
                ? 'Thank you for your payment! Premium features are now unlocked.'
                : 'Your subscription has been renewed. Enjoy premium features!'
            },
            data: { eventType }
          });
        }
      } catch (err) { /* ignore FCM errors for backend reliability */ }
    } else if (eventType === 'payment_cancel' || eventType === 'payment_expired') {
      const userSnap = await userRef.get();
      const existingDetails = userSnap.exists && userSnap.data().subscriptionDetails ? userSnap.data().subscriptionDetails : {};
      await userRef.set({
        isPremium: false,
        subscriptionDetails: {
          ...existingDetails,
          isActive: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      }, { merge: true });
      // Send FCM notification if possible
      try {
        const userDoc = await userRef.get();
        if (userDoc.exists && userDoc.data().fcmToken) {
          await sendUserNotification(userId, {
            notification: {
              title: eventType === 'payment_cancel' ? 'Subscription Cancelled' : 'Subscription Expired',
              body: eventType === 'payment_cancel'
                ? 'Your subscription was cancelled. Premium features are now disabled.'
                : 'Your subscription expired. Renew to regain premium access.'
            },
            data: { eventType }
          });
        }
      } catch (err) { /* ignore FCM errors for backend reliability */ }
    } else if (eventType === 'payment_refund') {
      // Send FCM notification if possible
      try {
        const userDoc = await userRef.get();
        if (userDoc.exists && userDoc.data().fcmToken) {
          await sendUserNotification(userId, {
            notification: {
              title: 'Payment Refunded',
              body: 'Your payment has been refunded. Please contact support for more information.'
            },
            data: { eventType }
          });
        }
      } catch (err) { /* ignore FCM errors for backend reliability */ }
    }
    // Record payment event
    await admin.firestore().collection('payments').add({
      userId,
      eventType,
      paymentInfo: paymentInfo || {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).send('Payment event handled');
  } catch (err) {
    console.error(err);
    return res.status(500).send('Internal error');
  }
});

exports.handlePaymentWebhook = functions.https.onRequest(app);
