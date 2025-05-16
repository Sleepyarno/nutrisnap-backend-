# NutriSnap Learn Tab - Backend Setup

This directory contains the backend setup files for the NutriSnap Learn tab. Follow these instructions to set up and deploy the Firebase backend for the Learn tab.

## Prerequisites

Before you begin, make sure you have the following:

- Node.js and npm installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project already set up and configured
- Firebase Admin SDK credentials (service account key)

## Directory Structure

```
LEARN/
├── content/                    # Markdown content with YAML front-matter
│   ├── what-is-a-glucose-spike.md
│   └── metabolic-health-beyond-diabetes.md
│   └── ... (additional articles)
├── setup/
│   ├── firestore_setup.js      # Script to set up Firestore collections
│   ├── seedFirestore.js        # Script to import content into Firestore
│   └── functions/              # Firebase Cloud Functions
│       ├── index.js            # Functions implementation
│       └── package.json        # Functions dependencies
└── LEARN_TAB_IMPLEMENTATION_CHECKLIST.md  # Implementation checklist
```

## Setup Instructions

### 1. Install Dependencies

```bash
# Install dependencies for content seeding script
cd /path/to/NutriSnap/LEARN/setup
npm install firebase-admin gray-matter fs path
```

### 2. Configure Service Account

Place your Firebase service account key in a secure location and update the path in `seedFirestore.js`:

```javascript
// In seedFirestore.js
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '/path/to/your-service-account-key.json';
```

Alternatively, set the environment variable:

```bash
export FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/your-service-account-key.json
```

### 3. Seed Firestore with Content

```bash
# Run the script to import content into Firestore
node seedFirestore.js
```

### 4. Deploy Firebase Functions

```bash
# Navigate to the functions directory
cd /path/to/NutriSnap/LEARN/setup/functions

# Install dependencies
npm install

# Deploy functions to Firebase
firebase use your-project-id  # Select your Firebase project
firebase deploy --only functions
```

## Firebase Functions API

The following Firebase Functions are available for the Learn tab:

1. **getKnowledgeArticleBySlug** - Get an article by its slug
2. **listKnowledgeArticlesByCategory** - List articles by category
3. **listKnowledgeCategories** - List all unique categories
4. **getFeaturedArticles** - Get featured articles
5. **getLatestArticles** - Get the latest articles
6. **searchKnowledgeArticles** - Search articles by query

These functions can be called from the iOS client using the Firebase SDK.

## Adding More Content

To add more articles to the Learn tab:

1. Create a new Markdown file in the `content` directory with appropriate YAML front-matter
2. Run the `seedFirestore.js` script again to import the new content

## Notes

- The Firestore security rules are not included in this setup. Make sure to configure appropriate security rules for your Firestore database.
- For production, consider implementing a more robust search solution such as Algolia or Firebase Extensions for full-text search capabilities.
