// Script to test Firestore connection and list all collections
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-nutrisnap2-learn-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'nutrisnap2',
  databaseURL: 'https://nutrisnap2.firebaseio.com'
});

const db = admin.firestore();

async function testConnection() {
  try {
    console.log('Testing Firestore connection...');
    
    // List all collections
    const collections = await db.listCollections();
    
    if (collections.length === 0) {
      console.log('No collections found in the database.');
      return;
    }
    
    console.log(`Found ${collections.length} collections:`);
    
    // Print each collection ID
    for (const collection of collections) {
      console.log(`- Collection ID: ${collection.id}`);
      
      // Get a sample of documents from each collection
      const snapshot = await db.collection(collection.id).limit(2).get();
      console.log(`  Documents in ${collection.id}: ${snapshot.size}`);
      
      if (!snapshot.empty) {
        console.log('  Sample document IDs:');
        snapshot.forEach(doc => {
          console.log(`    - ${doc.id}`);
        });
      }
      console.log('---');
    }
    
  } catch (error) {
    console.error('Error testing connection:', error);
  }
}

// Run the test
testConnection()
  .then(() => {
    console.log('Connection test finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('Connection test failed:', error);
    process.exit(1);
  });
