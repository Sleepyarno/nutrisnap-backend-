process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
const functions = require('firebase-functions-test')();
const admin = require('firebase-admin');
const request = require('supertest');
jest.mock('./notifications/fcm', () => ({
  sendUserNotification: jest.fn(() => Promise.resolve('mocked'))
}));
const { sendUserNotification } = require('./notifications/fcm');
const myFunctions = require('./payments');

if (!admin.apps.length) {
  admin.initializeApp();
}

describe('Payment Webhook (Backend Only)', () => {
  const app = myFunctions.handlePaymentWebhook;
  const userId = 'testUserId';

  beforeAll(async () => {
    jest.setTimeout(20000);
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    console.log('Deleting user before tests...');
    await Promise.race([
      admin.firestore().collection('users').doc(userId).delete(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore delete timeout')), 4000))
    ]);
    await new Promise(res => setTimeout(res, 500));
    console.log('User deleted before tests.');
  }, 20000);
  afterAll(async () => {
    console.log('Deleting user after tests...');
    await Promise.race([
      admin.firestore().collection('users').doc(userId).delete(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore delete timeout')), 4000))
    ]);
    await new Promise(res => setTimeout(res, 500));
    console.log('User deleted after tests.');
    await functions.cleanup();
  }, 20000);

  it('marks user as premium on payment_success and sends notification', async () => {
    await admin.firestore().collection('users').doc(userId).set({ fcmToken: 'fcm-test-token' }, { merge: true });
    const paymentInfo = { platform: 'stripe', productId: 'premium', expirationDate: new Date(Date.now() + 1000000) };
    await request(app)
      .post('/')
      .send({ userId, eventType: 'payment_success', paymentInfo })
      .expect(200);
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.data().isPremium).toBe(true);
    expect(userDoc.data().subscriptionDetails.isActive).toBe(true);
    expect(sendUserNotification).toHaveBeenCalledWith(userId, expect.objectContaining({
      notification: expect.objectContaining({ title: 'Payment Successful' })
    }));
    sendUserNotification.mockClear();
  }, 20000);

  it('marks user as not premium on payment_cancel and sends notification', async () => {
    await admin.firestore().collection('users').doc(userId).set({ fcmToken: 'fcm-test-token' }, { merge: true });
    await request(app)
      .post('/')
      .send({ userId, eventType: 'payment_cancel' })
      .expect(200);
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.data().isPremium).toBe(false);
    expect(userDoc.data().subscriptionDetails.isActive).toBe(false);
    expect(sendUserNotification).toHaveBeenCalledWith(userId, expect.objectContaining({
      notification: expect.objectContaining({ title: 'Subscription Cancelled' })
    }));
    sendUserNotification.mockClear();
  }, 20000);

  it('marks user as premium on payment renewal', async () => {
    // Simulate renewal (payment_success again)
    const paymentInfo = { platform: 'stripe', productId: 'premium', expirationDate: new Date(Date.now() + 2000000) };
    await request(app)
      .post('/')
      .send({ userId, eventType: 'payment_success', paymentInfo })
      .expect(200);
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.data().isPremium).toBe(true);
    expect(userDoc.data().subscriptionDetails.isActive).toBe(true);
    expect(new Date(userDoc.data().subscriptionDetails.expirationDate)).not.toBeNaN();
  }, 20000);

  it('handles refund event and sends notification', async () => {
    await admin.firestore().collection('users').doc(userId).set({ fcmToken: 'fcm-test-token' }, { merge: true });
    await request(app)
      .post('/')
      .send({ userId, eventType: 'payment_refund' })
      .expect(200);
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(sendUserNotification).toHaveBeenCalledWith(userId, expect.objectContaining({
      notification: expect.objectContaining({ title: 'Payment Refunded' })
    }));
    sendUserNotification.mockClear();
    // For now, refund event does not alter premium; you can adjust this logic if needed
    // expect(userDoc.data().isPremium).toBe(false); // Uncomment if refund should downgrade
  }, 20000);

  it('handles duplicate payment event gracefully', async () => {
    const paymentInfo = { platform: 'stripe', productId: 'premium', expirationDate: new Date(Date.now() + 3000000) };
    await request(app)
      .post('/')
      .send({ userId, eventType: 'payment_success', paymentInfo })
      .expect(200);
    await request(app)
      .post('/')
      .send({ userId, eventType: 'payment_success', paymentInfo })
      .expect(200);
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.data().isPremium).toBe(true);
  }, 20000);

  it('handles invalid event type gracefully', async () => {
    await request(app)
      .post('/')
      .send({ userId, eventType: 'invalid_event' })
      .expect(200); // Should still succeed, but not alter premium
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.exists).toBe(true);
  }, 20000);

  it('records payment events in payments collection', async () => {
    const paymentInfo = { platform: 'stripe', productId: 'premium' };
    await request(app)
      .post('/')
      .send({ userId, eventType: 'payment_success', paymentInfo })
      .expect(200);
    const paymentsSnap = await admin.firestore().collection('payments').where('userId', '==', userId).get();
    expect(paymentsSnap.size).toBeGreaterThan(0);
    const event = paymentsSnap.docs[0].data();
    expect(event.userId).toBe(userId);
    expect(['payment_success', 'payment_cancel', 'payment_expired', 'payment_refund']).toContain(event.eventType);
  }, 20000);
});
