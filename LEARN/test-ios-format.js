// Script to test the format expected by the iOS app
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-nutrisnap2-learn-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'nutrisnap2',
  databaseURL: 'https://nutrisnap2.firebaseio.com'
});

const db = admin.firestore();

async function testIosFormat() {
  try {
    console.log('Looking for existing featured articles...');
    
    const articlesCollection = db.collection('knowledgeBaseArticles');
    
    // Get all documents
    const snapshot = await articlesCollection
      .where('isFeatured', '==', true)
      .get();
    
    console.log(`Found ${snapshot.size} featured articles`);
    
    // Convert to different formats that iOS might expect
    if (!snapshot.empty) {
      // Format 1: Array of articles with full content
      const format1 = [];
      
      // Format 2: A response object with an articles property
      const format2 = { articles: [] };
      
      // Format 3: Array of simplified articles
      const format3 = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Processing article: ${doc.id}`);
        
        // Format 1: Full article data
        format1.push({
          id: doc.id,
          title: data.title || '',
          content: data.content || '',
          category: data.category || '',
          slug: data.slug || '',
          isFeatured: true,
          featured: true,
          publicationDate: data.publicationDate || new Date().toISOString(),
          imageUrl: data.imageUrl || '',
          tags: Array.isArray(data.tags) ? data.tags : []
        });
        
        // Format 2: Articles property
        format2.articles.push({
          id: doc.id,
          title: data.title || '',
          content: data.content || '',
          category: data.category || '',
          slug: data.slug || '',
          isFeatured: true,
          featured: true,
          publicationDate: data.publicationDate || new Date().toISOString(),
          imageUrl: data.imageUrl || '',
          tags: Array.isArray(data.tags) ? data.tags : []
        });
        
        // Format 3: Simplified for iOS
        format3.push({
          id: doc.id,
          title: data.title || '',
          summary: data.summary || data.content?.substring(0, 150) || '',
          category: data.category || '',
          publicationDate: data.publicationDate || new Date().toISOString()
        });
      });
      
      console.log('\nFormat 1 - Array of full articles:');
      console.log(JSON.stringify(format1, null, 2));
      
      console.log('\nFormat 2 - Response with articles property:');
      console.log(JSON.stringify(format2, null, 2));
      
      console.log('\nFormat 3 - Simplified for iOS:');
      console.log(JSON.stringify(format3, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testIosFormat()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
