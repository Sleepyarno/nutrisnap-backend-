// Script to verify articles in Firestore
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-nutrisnap2-learn-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'nutrisnap2',
  databaseURL: 'https://nutrisnap2.firebaseio.com'
});

const db = admin.firestore();

async function verifyArticles() {
  try {
    console.log('Checking knowledgeBaseArticles collection...');
    
    // Get all documents from the collection
    const articlesSnapshot = await db.collection('knowledgeBaseArticles').get();
    
    if (articlesSnapshot.empty) {
      console.log('No documents found in knowledgeBaseArticles collection.');
      return;
    }
    
    console.log(`Found ${articlesSnapshot.size} documents:`);
    
    // Print each document ID and some data
    articlesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`- Document ID: ${doc.id}`);
      console.log(`  Title: ${data.title}`);
      console.log(`  isFeatured: ${data.isFeatured}`);
      console.log(`  featured: ${data.featured}`);
      console.log(`  publicationDate: ${data.publicationDate instanceof admin.firestore.Timestamp ? 
                 data.publicationDate.toDate().toISOString() : data.publicationDate}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('Error verifying articles:', error);
  }
}

// Run the verification
verifyArticles()
  .then(() => {
    console.log('Verification process finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('Verification process failed:', error);
    process.exit(1);
  });
