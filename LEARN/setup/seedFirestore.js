/**
 * NutriSnap - Learn Tab - Firestore Database Seeding Script
 * 
 * This script reads Markdown files with YAML front-matter from the content directory
 * and imports them into Firestore's knowledgeBaseArticles collection.
 */

// Load environment variables from .env file
require('dotenv').config();

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter'); // For parsing front-matter

// Path to your service account key file from environment variable
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

// Path to the content directory from environment variable or default
const CONTENT_DIR = process.env.CONTENT_DIR 
  ? path.resolve(__dirname, process.env.CONTENT_DIR)
  : path.join(__dirname, '../content');

console.log(`Using service account: ${SERVICE_ACCOUNT_PATH}`);
console.log(`Using content directory: ${CONTENT_DIR}`);

// Only initialize Firebase if it hasn't been initialized yet
if (!admin.apps.length) {
  try {
    // Check if service account path exists
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.error(`\nERROR: Service account file not found at ${SERVICE_ACCOUNT_PATH}\n`);
      console.log('To proceed with Firebase deployment, you need valid service account credentials.');
      console.log('Please follow these steps:');
      console.log('1. Go to the Firebase Console: https://console.firebase.google.com/');
      console.log('2. Navigate to your project > Project Settings > Service Accounts');
      console.log('3. Click "Generate New Private Key"');
      console.log('4. Save the file to the path specified in your .env file');
      console.log('5. Run this script again\n');
      process.exit(1);
    }
    
    // Initialize Firebase Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH))
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('\nERROR initializing Firebase Admin SDK:', error);
    console.log('\nThe service account file exists but appears to be invalid.');
    console.log('Please ensure you have downloaded a valid service account key from the Firebase Console.');
    console.log('If you are using a placeholder file, replace it with an actual service account key.\n');
    process.exit(1);
  }
}

const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Reads all Markdown files from the content directory and imports them into Firestore
 */
async function importArticlesToFirestore() {
  try {
    // Ensure content directory exists
    if (!fs.existsSync(CONTENT_DIR)) {
      console.error(`Content directory not found: ${CONTENT_DIR}`);
      process.exit(1);
    }

    const files = fs.readdirSync(CONTENT_DIR);
    console.log(`Found ${files.length} files in content directory.`);

    let importedCount = 0;
    let skippedCount = 0;
    
    for (const file of files) {
      if (path.extname(file) === '.md') {
        const filePath = path.join(CONTENT_DIR, file);
        console.log(`Processing file: ${file}`);
        
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const { data: frontMatter, content: markdownContent } = matter(fileContent);
          
          // Validate front-matter
          if (!frontMatter.slug) {
            console.warn(`Skipping ${file}: Missing slug in front-matter.`);
            skippedCount++;
            continue;
          }
          
          if (!frontMatter.title) {
            console.warn(`Skipping ${file}: Missing title in front-matter.`);
            skippedCount++;
            continue;
          }
          
          if (!frontMatter.articleType) {
            console.warn(`Skipping ${file}: Missing articleType in front-matter.`);
            skippedCount++;
            continue;
          }
          
          // Create the article data object
          const articleData = {
            ...frontMatter,
            content: markdownContent.trim(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          // Convert date strings to Firestore Timestamps
          if (frontMatter.publicationDate && typeof frontMatter.publicationDate === 'string') {
            articleData.publicationDate = admin.firestore.Timestamp.fromDate(new Date(frontMatter.publicationDate));
          } else if (!frontMatter.publicationDate) {
            articleData.publicationDate = admin.firestore.FieldValue.serverTimestamp();
          }
          
          // Use the slug as the document ID for easy retrieval
          await articlesCollection.doc(frontMatter.slug).set(articleData);
          console.log(`Imported article: "${frontMatter.title}" (slug: ${frontMatter.slug})`);
          importedCount++;
          
        } catch (fileError) {
          console.error(`Error processing file ${file}:`, fileError);
          skippedCount++;
        }
      }
    }
    
    console.log(`\nImport summary:`);
    console.log(`- Total files found: ${files.length}`);
    console.log(`- Articles imported: ${importedCount}`);
    console.log(`- Files skipped: ${skippedCount}`);
    console.log('\nFirestore seeding completed successfully!');
    
  } catch (error) {
    console.error('Error seeding Firestore database:', error);
    process.exit(1);
  }
}

// Execute the import function if this script is run directly
if (require.main === module) {
  importArticlesToFirestore()
    .then(() => {
      console.log('Script execution completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Script execution failed:', error);
      process.exit(1);
    });
}

module.exports = { importArticlesToFirestore };
