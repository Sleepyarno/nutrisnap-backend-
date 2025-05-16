// NutriSnap Learn Tab - Firebase Functions
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

// Reference to Firestore database
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Get knowledge article by slug
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.slug - Article slug
 * @returns {Object} - Article data
 */
exports.learn_getKnowledgeArticleBySlug = functions.https.onCall(async (data) => {
  if (!data || !data.slug) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a valid slug parameter.'
    );
  }

  const slug = data.slug;
  
  try {
    // Query Firestore for the article with the given slug
    const snapshot = await articlesCollection
      .where('slug', '==', slug)
      .limit(1)
      .get();
    
    // Check if the article exists
    if (snapshot.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        `Article with slug "${slug}" not found.`
      );
    }
    
    // Return the article data
    const articleDoc = snapshot.docs[0];
    return {
      id: articleDoc.id,
      ...articleDoc.data()
    };
  } catch (error) {
    console.error('Error fetching article by slug:', error);
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while fetching the article.',
      error
    );
  }
});

/**
 * List knowledge articles by category
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.category - Category name
 * @param {number} data.limit - Maximum number of articles to return
 * @returns {Array} - List of articles in the category
 */
exports.learn_listKnowledgeArticlesByCategory = functions.https.onCall(async (data) => {
  if (!data || !data.category) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a valid category parameter.'
    );
  }

  const category = data.category;
  const limit = data.limit || 10; // Default to 10 articles
  
  try {
    // Query Firestore for articles in the given category
    const snapshot = await articlesCollection
      .where('category', '==', category)
      .orderBy('publicationDate', 'desc') // Sort by publication date, newest first
      .limit(limit)
      .get();
    
    // Check if any articles were found
    if (snapshot.empty) {
      return []; // Return an empty array if no articles found
    }
    
    // Map the query results
    const articles = [];
    snapshot.forEach(doc => {
      articles.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return articles;
  } catch (error) {
    console.error('Error listing articles by category:', error);
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while listing articles by category.',
      error
    );
  }
});

/**
 * List all knowledge categories
 * 
 * @returns {Array} - List of unique categories
 */
exports.learn_listKnowledgeCategories = functions.https.onCall(async () => {
  try {
    // Query Firestore for all articles to extract unique categories
    const snapshot = await articlesCollection.get();
    
    // Extract unique categories
    const categoriesSet = new Set();
    snapshot.forEach(doc => {
      const category = doc.data().category;
      if (category) {
        categoriesSet.add(category);
      }
    });
    
    // Convert Set to Array and sort alphabetically
    const categories = Array.from(categoriesSet).sort();
    
    return categories;
  } catch (error) {
    console.error('Error listing categories:', error);
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while listing categories.',
      error
    );
  }
});

/**
 * Get featured articles
 * 
 * @param {Object} data - Function parameters (optional)
 * @param {number} data.limit - Maximum number of featured articles to return
 * @returns {Array} - List of featured articles
 */
exports.learn_getFeaturedArticles = functions.https.onCall(async (data = null) => {
  // Default to 3 featured articles if data is null or limit is not specified
  const limit = data && data.limit ? data.limit : 3;
  
  try {
    // Query Firestore for featured articles
    const snapshot = await articlesCollection
      .where('isFeatured', '==', true)
      .orderBy('publicationDate', 'desc') // Sort by publication date, newest first
      .limit(limit)
      .get();
    
    // Check if any articles were found
    if (snapshot.empty) {
      return []; // Return an empty array if no featured articles found
    }
    
    // Map the query results
    const articles = [];
    snapshot.forEach(doc => {
      articles.push({
        id: doc.id,
        ...doc.data()
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

/**
 * Search knowledge articles
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.query - Search query
 * @param {number} data.limit - Maximum number of search results to return
 * @returns {Array} - List of matching articles
 */
exports.learn_searchKnowledgeArticles = functions.https.onCall(async (data) => {
  if (!data || !data.query) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a valid query parameter.'
    );
  }

  const query = data.query.toLowerCase();
  const limit = data.limit || 10; // Default to 10 results
  
  try {
    // Get all articles (for basic search implementation)
    // NOTE: For production, consider using a proper search solution like Algolia
    const snapshot = await articlesCollection.get();
    
    // Filter articles that match the search query in title, content, or tags
    const results = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Check if the query matches any of the searchable fields
      const titleMatch = data.title && data.title.toLowerCase().includes(query);
      const contentMatch = data.content && data.content.toLowerCase().includes(query);
      const tagsMatch = data.tags && data.tags.some(tag => tag.toLowerCase().includes(query));
      
      if (titleMatch || contentMatch || tagsMatch) {
        results.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    // Sort by relevance (title matches are more relevant than content matches)
    // This is a simple relevance algorithm that could be improved
    results.sort((a, b) => {
      const aTitleMatch = a.title.toLowerCase().includes(query);
      const bTitleMatch = b.title.toLowerCase().includes(query);
      
      if (aTitleMatch && !bTitleMatch) return -1;
      if (!aTitleMatch && bTitleMatch) return 1;
      
      // If both match or don't match in the title, sort by date
      return new Date(b.publicationDate) - new Date(a.publicationDate);
    });
    
    // Apply the limit
    return results.slice(0, limit);
  } catch (error) {
    console.error('Error searching articles:', error);
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while searching articles.',
      error
    );
  }
});

/**
 * Get latest articles
 * 
 * @param {Object} data - Function parameters
 * @param {number} data.limit - Maximum number of articles to return
 * @returns {Array} - List of latest articles
 */
exports.learn_getLatestArticles = functions.https.onCall(async (data = null) => {
  const limit = data && data.limit ? data.limit : 5; // Default to 5 latest articles
  
  try {
    // Query Firestore for the latest articles
    const snapshot = await articlesCollection
      .orderBy('publicationDate', 'desc') // Sort by publication date, newest first
      .limit(limit)
      .get();
    
    // Check if any articles were found
    if (snapshot.empty) {
      return []; // Return an empty array if no articles found
    }
    
    // Map the query results
    const articles = [];
    snapshot.forEach(doc => {
      articles.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return articles;
  } catch (error) {
    console.error('Error fetching latest articles:', error);
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while fetching the latest articles.',
      error
    );
  }
});
