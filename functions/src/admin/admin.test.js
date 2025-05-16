const functions = require('firebase-functions-test')();
const admin = require('firebase-admin');
const { isAdmin } = require('./utils');
const { listUsers } = require('./listUsers');
const { listPayments } = require('./listPayments');
const { listScans } = require('./listScans');

describe('Admin Backend Features', () => {
  let wrappedListUsers, wrappedListPayments, wrappedListScans;
  const adminId = 'adminUser';
  const userId = 'regularUser';

  beforeAll(async () => {
    wrappedListScans = functions.wrap(listScans);
    wrappedListPayments = functions.wrap(listPayments);
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    if (!admin.apps.length) admin.initializeApp();
    wrappedListUsers = functions.wrap(listUsers);
    wrappedListPayments = functions.wrap(listPayments);
    await admin.firestore().collection('users').doc(adminId).set({ role: 'admin', createdAt: Date.now() });
    await admin.firestore().collection('users').doc(userId).set({ role: 'user', createdAt: Date.now() });
  });
  afterAll(async () => {
    // Clean up test scans
    const scansSnap = await admin.firestore().collection('users').doc(userId).collection('scans').get();
    for (const doc of scansSnap.docs) await doc.ref.delete();
    // Clean up any test payments
    const paymentsSnap = await admin.firestore().collection('payments').where('userId', '==', userId).get();
    for (const doc of paymentsSnap.docs) await doc.ref.delete();
    await admin.firestore().collection('users').doc(adminId).delete();
    await admin.firestore().collection('users').doc(userId).delete();
    await functions.cleanup();
  });

  it('isAdmin returns true for admin and false for regular user', async () => {
    expect(await isAdmin(adminId)).toBe(true);
    expect(await isAdmin(userId)).toBe(false);
  });

  it('allows admin to list users', async () => {
    const context = { auth: { uid: adminId } };
    const data = { limit: 10 };
    const result = await wrappedListUsers(data, context);
    expect(Array.isArray(result.users)).toBe(true);
    expect(result.users.find(u => u.id === adminId)).toBeDefined();
    expect(result.users.find(u => u.id === userId)).toBeDefined();
  });

  it('denies non-admin from listing users', async () => {
    const context = { auth: { uid: userId } };
    const data = { limit: 10 };
    await expect(wrappedListUsers(data, context)).rejects.toThrow('Admin privileges required');
  });

  it('allows admin to list scans for any user', async () => {
    // Add a scan for testing
    const scanId = 'scan1';
    await admin.firestore().collection('users').doc(userId).collection('scans').doc(scanId).set({
      food: 'apple',
      createdAt: Date.now(),
      result: 'healthy'
    });
    const context = { auth: { uid: adminId } };
    const data = { userId, limit: 10 };
    const result = await wrappedListScans(data, context);
    expect(Array.isArray(result.scans)).toBe(true);
    expect(result.scans.find(s => s.id === scanId)).toBeDefined();
    // Clean up
    await admin.firestore().collection('users').doc(userId).collection('scans').doc(scanId).delete();
  });

  it('denies non-admin from listing scans', async () => {
    const context = { auth: { uid: userId } };
    const data = { userId, limit: 10 };
    await expect(wrappedListScans(data, context)).rejects.toThrow('Admin privileges required');
  });

  // setUserPremiumStatus tests
  let wrappedSetUserPremiumStatus;
  beforeAll(() => {
    wrappedSetUserPremiumStatus = functions.wrap(require('./setUserPremiumStatus').setUserPremiumStatus);
  });

  it('allows admin to set/unset premium status for any user', async () => {
    const context = { auth: { uid: adminId } };
    // Set premium true
    let data = { targetUserId: userId, isPremium: true };
    await expect(wrappedSetUserPremiumStatus(data, context)).resolves.toMatchObject({ success: true });
    let userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.data().isPremium).toBe(true);
    // Set premium false
    data = { targetUserId: userId, isPremium: false };
    await expect(wrappedSetUserPremiumStatus(data, context)).resolves.toMatchObject({ success: true });
    userDoc = await admin.firestore().collection('users').doc(userId).get();
    expect(userDoc.data().isPremium).toBe(false);
  });

  it('denies non-admin from setting premium status', async () => {
    const context = { auth: { uid: userId } };
    const data = { targetUserId: adminId, isPremium: true };
    await expect(wrappedSetUserPremiumStatus(data, context)).rejects.toThrow('Admin privileges required');
  });

  // getUsageStats tests
  let wrappedGetUsageStats;
  beforeAll(() => {
    wrappedGetUsageStats = functions.wrap(require('./getUsageStats').getUsageStats);
  });

  it('allows admin to get usage stats', async () => {
    // Add a scan and payment for stats
    const scanId = 'statScan';
    await admin.firestore().collection('users').doc(userId).collection('scans').doc(scanId).set({ createdAt: Date.now() });
    const paymentId = 'statPay';
    await admin.firestore().collection('payments').doc(paymentId).set({ userId, amount: 5, createdAt: Date.now() });
    const context = { auth: { uid: adminId } };
    const result = await wrappedGetUsageStats({}, context);
    expect(result.totalUsers).toBeGreaterThanOrEqual(2);
    expect(result.totalScans).toBeGreaterThanOrEqual(1);
    expect(result.totalPayments).toBeGreaterThanOrEqual(1);
    // Clean up
    await admin.firestore().collection('users').doc(userId).collection('scans').doc(scanId).delete();
    await admin.firestore().collection('payments').doc(paymentId).delete();
  });

  it('denies non-admin from getting usage stats', async () => {
    const context = { auth: { uid: userId } };
    await expect(wrappedGetUsageStats({}, context)).rejects.toThrow('Admin privileges required');
  });

  // getUsageAnalytics tests
  let wrappedGetUsageAnalytics;
  beforeAll(() => {
    wrappedGetUsageAnalytics = functions.wrap(require('./getUsageAnalytics').getUsageAnalytics);
  });

  it('allows admin to get usage analytics', async () => {
    // Add two users, one premium, one not, with scans
    const user1 = 'user1';
    const user2 = 'user2';
    await admin.firestore().collection('users').doc(user1).set({ isPremium: true });
    await admin.firestore().collection('users').doc(user2).set({ isPremium: false });
    // user1: 2 scans, both with glucosePrediction
    await admin.firestore().collection('users').doc(user1).collection('scans').doc('s1').set({ createdAt: Date.now(), glucosePrediction: { peak: 150 } });
    await admin.firestore().collection('users').doc(user1).collection('scans').doc('s2').set({ createdAt: Date.now(), glucosePrediction: { peak: 120 } });
    // user2: 1 scan, with metabolicAdvice
    await admin.firestore().collection('users').doc(user2).collection('scans').doc('s3').set({ createdAt: Date.now(), metabolicAdvice: { impact: 'moderate' } });
    const context = { auth: { uid: adminId } };
    const result = await wrappedGetUsageAnalytics({}, context);
    expect(result.totalUsers).toBeGreaterThanOrEqual(2);
    expect(result.premiumUsers).toBeGreaterThanOrEqual(1);
    expect(result.totalScans).toBeGreaterThanOrEqual(3);
    expect(result.scansPerUser[user1]).toBe(2);
    expect(result.scansPerUser[user2]).toBe(1);
    expect(result.premiumFeatureUsage).toBeGreaterThanOrEqual(3);
    // Clean up
    await admin.firestore().collection('users').doc(user1).delete();
    await admin.firestore().collection('users').doc(user2).delete();
  });

  it('denies non-admin from getting usage analytics', async () => {
    const context = { auth: { uid: userId } };
    await expect(wrappedGetUsageAnalytics({}, context)).rejects.toThrow('Admin privileges required');
  });
});
