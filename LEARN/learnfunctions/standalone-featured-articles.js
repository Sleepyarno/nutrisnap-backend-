/**
 * Standalone Featured Articles Function
 * 
 * This is a self-contained function to deploy independently without 
 * affecting other parts of the app.
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');

// Initialize Firebase Admin SDK if not already initialized
try {
  admin.app();
} catch (e) {
  admin.initializeApp();
}

// Reference to Firestore database
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Get featured articles function that matches the field name in your markdown files
 */
exports.getFeaturedArticles = functions
  .runWith({
    memory: '256MB',
    timeoutSeconds: 60
  })
  .https.onCall(async (data = null) => {
    // Default to 3 featured articles
    const limit = data && data.limit ? data.limit : 3;
    
    try {
      // Query for articles where isFeatured is true
      const snapshot = await articlesCollection
        .where('isFeatured', '==', true)
        .orderBy('publicationDate', 'desc')
        .limit(limit)
        .get();
      
      if (snapshot.empty) {
        return [];
      }
      
      // Format for iOS app compatibility
      const articles = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        articles.push({
          id: doc.id,
          title: data.title || '',
          content: data.content || '',
          category: data.category || '',
          slug: data.slug || '',
          isFeatured: true,
          publicationDate: data.publicationDate || new Date().toISOString(),
          imageUrl: data.imageUrl || '',
          tags: Array.isArray(data.tags) ? data.tags : []
        });
      });
      
      return articles;
    } catch (error) {
      console.error('Error fetching featured articles:', error);
      throw new functions.https.HttpsError(
        'internal',
        'An error occurred while fetching featured articles.',
        error
      );
    }
  });
