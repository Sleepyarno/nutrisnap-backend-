const functions = require('firebase-functions-test')();
const admin = require('firebase-admin');
const { registerFcmToken } = require('./registerFcmToken');

describe('Notifications Backend', () => {
  const userId = 'notifUser';
  let wrappedRegisterFcmToken;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    if (!admin.apps.length) admin.initializeApp();
    wrappedRegisterFcmToken = functions.wrap(registerFcmToken);
    await admin.firestore().collection('users').doc(userId).set({});
  });
  afterAll(async () => {
    await admin.firestore().collection('users').doc(userId).delete();
    await functions.cleanup();
  });

  it('registers and updates FCM token for authenticated user', async () => {
    const context = { auth: { uid: userId } };
    const data = { fcmToken: 'test-fcm-token-123' };
    await expect(wrappedRegisterFcmToken(data, context)).resolves.toMatchObject({ success: true });
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.data().fcmToken).toBe('test-fcm-token-123');
  });

  it('rejects unauthenticated user', async () => {
    const context = {};
    const data = { fcmToken: 'test-fcm-token-456' };
    await expect(wrappedRegisterFcmToken(data, context)).rejects.toThrow('User must be authenticated');
  });

  it('rejects missing or invalid token', async () => {
    const context = { auth: { uid: userId } };
    await expect(wrappedRegisterFcmToken({}, context)).rejects.toThrow('A valid fcmToken is required');
    await expect(wrappedRegisterFcmToken({ fcmToken: 12345 }, context)).rejects.toThrow('A valid fcmToken is required');
  });
});
