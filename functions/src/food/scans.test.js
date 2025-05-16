process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
const test = require('firebase-functions-test')();
const admin = require('firebase-admin');
const scans = require('./scans');

// Initialize the admin SDK for tests (only if not already initialized)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

describe('Scan Cloud Functions', () => {
  const premiumFields = {
    glucosePrediction: { timePoints: [0, 30, 60], values: [90, 120, 100], peakValue: 120, peakTime: 30 },
    metabolicAdvice: { impact: 'moderate', tips: ['Eat slower', 'Add fiber'] }
  };

  it('rejects non-premium user writing premium fields', async () => {
    // Ensure user is NOT premium
    await admin.firestore().collection('users').doc(mockUserId).set({ isPremium: false });
    const context = { auth: { uid: mockUserId } };
    const { scanId } = await wrappedCreateScan({ imageUrl: mockImageUrl }, context);
    await expect(wrappedUpdateScan({ scanId, update: premiumFields }, context)).rejects.toThrow('Premium features are only available for premium users.');
  });

  it('allows premium user to write premium fields', async () => {
    // Set user as premium
    await admin.firestore().collection('users').doc(mockUserId).set({ isPremium: true });
    const context = { auth: { uid: mockUserId } };
    const { scanId } = await wrappedCreateScan({ imageUrl: mockImageUrl }, context);
    await expect(wrappedUpdateScan({ scanId, update: premiumFields }, context)).resolves.toEqual({ success: true });
    // Check data written
    const scanDoc = await admin.firestore().collection('users').doc(mockUserId).collection('scans').doc(scanId).get();
    expect(scanDoc.data().glucosePrediction).toBeDefined();
    expect(scanDoc.data().metabolicAdvice).toBeDefined();
  });

  let wrappedCreateScan, wrappedUpdateScan, wrappedGetScanResult, wrappedGetScanHistory;
  const mockUserId = 'testUserId';
  const mockImageUrl = 'https://example.com/image.jpg';

  beforeAll(() => {
    wrappedCreateScan = test.wrap(scans.createScan);
    wrappedUpdateScan = test.wrap(scans.updateScan);
    wrappedGetScanResult = test.wrap(scans.getScanResult);
    wrappedGetScanHistory = test.wrap(scans.getScanHistory);
  });

  afterAll(() => {
    test.cleanup();
  });

  it('creates a scan record', async () => {
    const context = { auth: { uid: mockUserId } };
    const data = { imageUrl: mockImageUrl };
    const result = await wrappedCreateScan(data, context);
    expect(result).toHaveProperty('scanId');
    // Optionally check Firestore for record
    const scanDoc = await admin.firestore().collection('users').doc(mockUserId).collection('scans').doc(result.scanId).get();
    expect(scanDoc.exists).toBe(true);
    expect(scanDoc.data().imageUrl).toBe(mockImageUrl);
  });

  it('updates a scan record', async () => {
    const context = { auth: { uid: mockUserId } };
    // First, create a scan
    const { scanId } = await wrappedCreateScan({ imageUrl: mockImageUrl }, context);
    // Then, update it
    const update = { status: 'completed', detectedItems: [{ name: 'Apple', confidence: 0.97 }] };
    const result = await wrappedUpdateScan({ scanId, update }, context);
    expect(result).toEqual({ success: true });
    const scanDoc = await admin.firestore().collection('users').doc(mockUserId).collection('scans').doc(scanId).get();
    expect(scanDoc.data().status).toBe('completed');
    expect(scanDoc.data().detectedItems[0].name).toBe('Apple');
  });

  it('retrieves a scan result', async () => {
    const context = { auth: { uid: mockUserId } };
    const { scanId } = await wrappedCreateScan({ imageUrl: mockImageUrl }, context);
    await wrappedUpdateScan({ scanId, update: { status: 'completed' } }, context);
    const result = await wrappedGetScanResult({ scanId }, context);
    expect(result.id).toBe(scanId);
    expect(result.status).toBe('completed');
  });

  it('retrieves scan history', async () => {
    const context = { auth: { uid: mockUserId } };
    // Create multiple scans
    await wrappedCreateScan({ imageUrl: mockImageUrl }, context);
    await wrappedCreateScan({ imageUrl: mockImageUrl }, context);
    const result = await wrappedGetScanHistory({ limit: 2 }, context);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects unauthenticated access', async () => {
    await expect(wrappedCreateScan({ imageUrl: mockImageUrl }, {})).rejects.toThrow('User must be authenticated');
  });
});
