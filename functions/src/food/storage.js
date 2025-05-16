// Use Firebase Functions v1 for all storage functions to maintain consistency
const functionsV1 = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Generate a signed URL for image upload
exports.getUploadUrl = functionsV1.runWith({
  memory: '512MB',
  timeoutSeconds: 60 // Extended timeout
}).https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functionsV1.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { contentType } = data;
  
  if (!contentType || !contentType.startsWith('image/')) {
    throw new functionsV1.https.HttpsError(
      'invalid-argument',
      'Content type must be an image'
    );
  }
  
  try {
    const fileName = `${uuidv4()}.${contentType.split('/')[1]}`;
    const filePath = `users/${userId}/images/${fileName}`;
    
    const bucket = admin.storage().bucket();
    const [url] = await bucket.file(filePath).getSignedUrl({
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType
    });
    
    return {
      url,
      filePath,
      downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    throw new functionsV1.https.HttpsError('internal', error.message);
  }
});

// Process image after upload
const { Timestamp } = require('firebase-admin/firestore');

// Using v1 syntax for storage triggers
exports.processUploadedImage = functionsV1.runWith({
  memory: '512MB',
  timeoutSeconds: 300
}).storage.object().onFinalize(async (object) => {
  const filePath = object.name;
  
  // Only process images
  if (!object.contentType.startsWith('image/')) {
    console.log('Not an image, skipping processing');
    return null;
  }
  
  // Extract user ID from path
  const pathParts = filePath.split('/');
  if (pathParts.length < 3 || pathParts[0] !== 'users') {
    console.log('Invalid file path format, skipping processing');
    return null;
  }
  
  const userId = pathParts[1];
  
  try {
    // Create a record in Firestore for this image
    const imageRef = admin.firestore().collection('users').doc(userId)
      .collection('images').doc();
    
    await imageRef.set({
      filePath,
      contentType: object.contentType,
      uploadedAt: Timestamp.now(),
      size: object.size,
      processed: false
    });
    
    console.log(`Created image record ${imageRef.id} for user ${userId}`);
    return null;
  } catch (error) {
    console.error('Error processing uploaded image:', error);
    return null;
  }
});
