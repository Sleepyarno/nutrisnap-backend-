const functions = require('firebase-functions-test')();
const admin = require('firebase-admin');
jest.mock('../notifications/fcm', () => ({
  sendUserNotification: jest.fn(() => Promise.resolve('mocked'))
}));
const { sendUserNotification } = require('../notifications/fcm');
const { predictGlucoseResponse } = require('./glucose');
const { generateMetabolicAdvice } = require('./advice');

let wrappedPredict, wrappedAdvice;

describe('Premium Features Cloud Functions', () => {
  const mockUserId = 'premiumUser';
  const mockScanId = 'scan1';
  const scanRef = () => admin.firestore().collection('users').doc(mockUserId).collection('scans').doc(mockScanId);

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    if (!admin.apps.length) admin.initializeApp();
    wrappedPredict = functions.wrap(predictGlucoseResponse);
    wrappedAdvice = functions.wrap(generateMetabolicAdvice);
    await admin.firestore().collection('users').doc(mockUserId).set({ isPremium: true });
    await scanRef().set({ imageUrl: 'https://example.com/image.jpg' });
  });
  afterAll(async () => {
    await admin.firestore().collection('users').doc(mockUserId).delete();
    await functions.cleanup();
  });

  it('predicts glucose response for premium user and sends notification', async () => {
    await admin.firestore().collection('users').doc(mockUserId).set({ isPremium: true, fcmToken: 'fcm-test-token' }, { merge: true });
    const context = { auth: { uid: mockUserId } };
    const data = { scanId: mockScanId };
    const result = await wrappedPredict(data, context);
    expect(result.glucosePrediction).toBeDefined();
    const scanDoc = await scanRef().get();
    expect(scanDoc.data().glucosePrediction).toBeDefined();
    expect(sendUserNotification).toHaveBeenCalledWith(mockUserId, expect.objectContaining({
      notification: expect.objectContaining({ title: 'Scan Result Ready' })
    }));
    sendUserNotification.mockClear();
  });

  it('generates metabolic advice for premium user and sends notification', async () => {
    await admin.firestore().collection('users').doc(mockUserId).set({ isPremium: true, fcmToken: 'fcm-test-token' }, { merge: true });
    const context = { auth: { uid: mockUserId } };
    const data = { scanId: mockScanId };
    const result = await wrappedAdvice(data, context);
    expect(result.metabolicAdvice).toBeDefined();
    const scanDoc = await scanRef().get();
    expect(scanDoc.data().metabolicAdvice).toBeDefined();
    expect(sendUserNotification).toHaveBeenCalledWith(mockUserId, expect.objectContaining({
      notification: expect.objectContaining({ title: 'Scan Result Ready' })
    }));
    sendUserNotification.mockClear();
  });

  it('rejects non-premium user for premium features', async () => {
    const nonPremiumId = 'nonPremiumUser';
    await admin.firestore().collection('users').doc(nonPremiumId).set({ isPremium: false });
    const context = { auth: { uid: nonPremiumId } };
    const data = { scanId: mockScanId };
    await expect(wrappedPredict(data, context)).rejects.toThrow('Premium feature. Upgrade required.');
    await expect(wrappedAdvice(data, context)).rejects.toThrow('Premium feature. Upgrade required.');
  });
});
