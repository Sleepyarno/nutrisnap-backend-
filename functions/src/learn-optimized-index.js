/**
 * NutriSnap Learn Tab Functions - Fixed Version Using Correct Field Names
 * 
 * This module provides the featured articles function with the correct field names
 * to match what's used in the article Markdown files (isFeatured).
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Use admin SDK from the main app (don't initialize again)
try {
  admin.app();
} catch (e) {
  admin.initializeApp();
}

// Reference to Firestore database
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Get featured articles with proper field names (isFeatured)
 */
exports.getFeaturedArticles = functions
  .runWith({
    memory: '256MB',
    timeoutSeconds: 60
  })
  .https.onCall(async (data = null) => {
    // Default to 3 featured articles if data is null or limit is not specified
    const limit = data && data.limit ? data.limit : 3;
    
    try {
      // Use the correct field name 'isFeatured' that matches the Markdown frontmatter
      // And the existing Firestore index
      const snapshot = await articlesCollection
        .where('isFeatured', '==', true)
        .orderBy('publicationDate', 'desc')
        .limit(limit)
        .get();
      
      if (snapshot.empty) {
        return []; // Return an empty array if no articles found
      }
      
      // Format for iOS app compatibility, keeping the same field names as in documents
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
