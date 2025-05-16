// Test script to match the iOS app's expected model
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-nutrisnap2-learn-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'nutrisnap2',
  databaseURL: 'https://nutrisnap2.firebaseio.com'
});

const db = admin.firestore();

async function testIosModel() {
  try {
    console.log('Testing iOS model compatibility');
    
    // Get some featured articles
    const articlesCollection = db.collection('knowledgeBaseArticles');
    const snapshot = await articlesCollection.where('isFeatured', '==', true).get();
    
    if (snapshot.empty) {
      console.log('No featured articles found');
      return;
    }
    
    console.log(`Found ${snapshot.size} featured articles`);
    
    // Format data like other Learn functions (learn_listKnowledgeArticlesByCategory, etc.)
    const articles = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Process date properly
      let publicationDate;
      if (data.publicationDate) {
        if (typeof data.publicationDate === 'string') {
          publicationDate = data.publicationDate;
        } else if (data.publicationDate.toDate) {
          publicationDate = data.publicationDate.toDate().toISOString();
        } else if (data.publicationDate._seconds) {
          publicationDate = new Date(data.publicationDate._seconds * 1000).toISOString();
        } else {
          publicationDate = new Date().toISOString();
        }
      } else {
        publicationDate = new Date().toISOString();
      }
      
      // Create an article object that should match the iOS app's model
      articles.push({
        id: doc.id,
        title: data.title || '',
        // 'article' seems to be the standard type
        articleType: data.articleType || 'article',
        // 'featured' seems to be a required property
        featured: true,
        isFeatured: true,
        // 'summary' is used for previews
        summary: data.summary || data.content?.substring(0, 150) || '',
        // 'content' contains the full article
        content: data.content || '',
        // 'category' for grouping
        category: data.category || '',
        // 'slug' for URL paths
        slug: data.slug || doc.id,
        // 'publicationDate' in ISO format
        publicationDate: publicationDate,
        // 'imageUrl' for featured image
        imageUrl: data.imageUrl || '',
        // 'tags' for search/filtering
        tags: Array.isArray(data.tags) ? data.tags : []
      });
    });
    
    console.log('Format that should work with iOS model:');
    console.log(JSON.stringify(articles, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testIosModel()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
