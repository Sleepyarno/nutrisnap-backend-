# Firebase Storage

This document provides step-by-step instructions for implementing Firebase Storage in the NutriSnap app to handle image uploads.

## Step 1: Create Storage Module

Create a new file `functions/src/food/storage.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Generate a signed URL for image upload
exports.getUploadUrl = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const userId = context.auth.uid;
  const { contentType } = data;
  
  if (!contentType || !contentType.startsWith('image/')) {
    throw new functions.https.HttpsError(
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
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Process image after upload
exports.processUploadedImage = functions.storage.object().onFinalize(async (object) => {
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
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
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
```

## Step 2: Update Package.json

Add the UUID package to your dependencies:

```bash
cd functions
npm install uuid
cd ..
```

## Step 3: Update Functions Index

Update your `functions/index.js` to include the storage functions:

```javascript
const storageFunctions = require('./src/food/storage');

// Export storage functions
exports.getUploadUrl = storageFunctions.getUploadUrl;
exports.processUploadedImage = storageFunctions.processUploadedImage;
```

## Step 4: Create Storage Service for Frontend

Create a file called `storage-service.js` in your frontend code:

```javascript
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase-config';

const storage = getStorage(app);
const functions = getFunctions(app);

// Get a signed URL for direct upload
export const getUploadUrl = async (contentType) => {
  try {
    const getUploadUrlFn = httpsCallable(functions, 'getUploadUrl');
    const result = await getUploadUrlFn({ contentType });
    return result.data;
  } catch (error) {
    console.error('Error getting upload URL:', error);
    throw error;
  }
};

// Upload image using Firebase Storage SDK
export const uploadImage = async (file, userId) => {
  try {
    // Create a storage reference
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `users/${userId}/images/${fileName}`;
    const storageRef = ref(storage, filePath);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return {
      filePath,
      downloadURL
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

// Upload image using signed URL (for larger files)
export const uploadImageWithSignedUrl = async (file) => {
  try {
    // Get a signed URL
    const { url, filePath, downloadUrl } = await getUploadUrl(file.type);
    
    // Upload directly to the signed URL
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type
      },
      body: file
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    return {
      filePath,
      downloadURL: downloadUrl
    };
  } catch (error) {
    console.error('Error uploading with signed URL:', error);
    throw error;
  }
};

// Get image URL by path
export const getImageUrl = async (filePath) => {
  try {
    const imageRef = ref(storage, filePath);
    return await getDownloadURL(imageRef);
  } catch (error) {
    console.error('Error getting image URL:', error);
    throw error;
  }
};
```

## Step 5: Implement Image Upload Component

Create an image upload component for your frontend:

```javascript
// Example React component for image upload
import React, { useState } from 'react';
import { uploadImage } from './storage-service';
import { getCurrentUser } from './auth-service';

const ImageUpload = ({ onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  
  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };
  
  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }
    
    try {
      setUploading(true);
      setProgress(0);
      setError(null);
      
      const user = getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // For files larger than 5MB, use signed URL
      if (file.size > 5 * 1024 * 1024) {
        const result = await uploadImageWithSignedUrl(file);
        onUploadComplete(result);
      } else {
        const result = await uploadImage(file, user.uid);
        onUploadComplete(result);
      }
      
      setFile(null);
    } catch (error) {
      console.error('Upload error:', error);
      setError(error.message);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
      
      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
      
      {uploading && (
        <div>
          <progress value={progress} max="100" />
          <span>{progress}%</span>
        </div>
      )}
      
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
};

export default ImageUpload;
```

## Step 6: Update Storage Rules

Ensure your `storage.rules` file has the correct security rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User images - users can only access their own images
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Public assets - readable by all users
    match /public/{allPaths=**} {
      allow read: if true;
      allow write: if false; // Only admins can write
    }
  }
}
```

## Step 7: Deploy Storage Rules

Deploy your storage rules:

```bash
firebase deploy --only storage
```

## Step 8: Test Image Upload

1. Deploy your functions:
   ```bash
   firebase deploy --only functions:getUploadUrl,functions:processUploadedImage
   ```

2. Or test locally with the emulator:
   ```bash
   firebase emulators:start
   ```

3. Test uploading an image through your frontend component
4. Verify the image is stored in Firebase Storage
5. Verify a record is created in Firestore

## Next Steps

Now that storage is set up for handling images, proceed to implementing the [Food Detection Service](04_food_detection_service.md).
