// Script to import markdown articles to Firestore
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const matter = require('gray-matter');

// Initialize Firebase Admin SDK
const serviceAccount = require('../firebase-nutrisnap2-learn-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'nutrisnap2',
  databaseURL: 'https://nutrisnap2.firebaseio.com'
});

const db = admin.firestore();
const contentDir = path.join(__dirname, 'content');
const articlesCollection = db.collection('knowledgeBaseArticles');

async function importArticles() {
  try {
    console.log('Starting import of articles...');
    
    // Read all markdown files from content directory
    const files = fs.readdirSync(contentDir).filter(file => file.endsWith('.md'));
    
    console.log(`Found ${files.length} markdown files`);
    
    for (const file of files) {
      const filePath = path.join(contentDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Parse front matter
      const { data, content } = matter(fileContent);
      
      // Create document ID from slug
      const documentId = data.slug;
      
      // Prepare document data
      const documentData = {
        ...data,
        content: content,
        // Ensure we have both field names for now (for compatibility)
        featured: data.isFeatured || false,
        isFeatured: data.isFeatured || false,
        // Convert date string to Firestore timestamp if it exists
        publicationDate: data.publicationDate ? 
          admin.firestore.Timestamp.fromDate(new Date(data.publicationDate)) : 
          admin.firestore.Timestamp.now()
      };
      
      // Upload to Firestore
      await articlesCollection.doc(documentId).set(documentData);
      console.log(`Uploaded article: ${data.title} (${documentId})`);
    }
    
    console.log('Import completed successfully!');
  } catch (error) {
    console.error('Error importing articles:', error);
  }
}

// Run the import
importArticles()
  .then(() => {
    console.log('Import process finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('Import process failed:', error);
    process.exit(1);
  });
