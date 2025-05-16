# NutriSnap Learn Tab - Deployment Guide

This guide provides step-by-step instructions for deploying the NutriSnap Learn tab backend components. Follow these instructions to properly set up and deploy the Firebase backend for the educational Learn tab.

## Prerequisites

- Firebase project already created (dev, test, prod environments)
- Node.js and npm installed
- Firebase CLI installed (`npm install -g firebase-tools`)

## Step 1: Obtain Firebase Credentials

1. Go to the Firebase Console: [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Select your Firebase project (dev, test, or prod)
3. Navigate to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Save the file to `/Users/arnauddecube/MANUS/NutriSnap/firebase-credentials.json`
   (or update the path in your `.env` file)

## Step 2: Install Dependencies

All dependencies should already be installed, but if needed:

```bash
cd /Users/arnauddecube/MANUS/NutriSnap/LEARN/setup
npm install

cd /Users/arnauddecube/MANUS/NutriSnap/LEARN/setup/functions
npm install
```

## Step 3: Import Content to Firestore

Once you have valid Firebase credentials:

```bash
cd /Users/arnauddecube/MANUS/NutriSnap/LEARN/setup
node seedFirestore.js
```

This will import all Markdown files from the `content` directory into the Firestore `knowledgeBaseArticles` collection.

## Step 4: Deploy Firebase Functions

```bash
cd /Users/arnauddecube/MANUS/NutriSnap/LEARN/setup/functions

# Log in to Firebase (if not already logged in)
firebase login

# Select your project (dev, test, or prod)
firebase use nutrisnap-dev  # Change to your actual project ID

# Deploy functions
firebase deploy --only functions
```

## Step 5: Update Firestore Security Rules

1. Copy the rules from `/Users/arnauddecube/MANUS/NutriSnap/LEARN/setup/firestore.learn.rules`
2. Integrate them into your main Firestore rules file following the guidance in `FIRESTORE_RULES_INTEGRATION.md`
3. Deploy the updated rules:

```bash
firebase deploy --only firestore:rules
```

## Step 6: Verify Deployment

1. Go to the Firebase Console > Functions
2. Verify that all Learn tab functions are deployed:
   - `getKnowledgeArticleBySlug`
   - `listKnowledgeArticlesByCategory`
   - `listKnowledgeCategories`
   - `searchKnowledgeArticles`
   - `getFeaturedArticles`
   - `getLatestArticles`

3. Go to Firestore Database > Data
4. Verify that the `knowledgeBaseArticles` collection exists and contains the imported articles

## Step 7: Update Implementation Checklist

Update the `LEARN_TAB_IMPLEMENTATION_CHECKLIST.md` file to mark the deployment tasks as completed.

## Environment-Specific Deployment

To deploy to different environments:

```bash
# For development
cd /Users/arnauddecube/MANUS/NutriSnap/LEARN/setup
npm run deploy:dev

# For testing
npm run deploy:test

# For production
npm run deploy:prod
```

## Troubleshooting

If you encounter issues:

- **Error with Firebase credentials**: Ensure your service account key file is valid and the path is correct in `.env`
- **Missing content**: Check that the content directory contains valid Markdown files with YAML front-matter
- **Deployment permissions**: Ensure you have the necessary permissions for the Firebase project
- **Function errors**: Check the Firebase Functions logs in the Firebase Console
