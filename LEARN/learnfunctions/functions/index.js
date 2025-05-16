// NutriSnap Learn Tab Functions - Isolated Implementation V2
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
 * Helper function to log function calls and responses 
 */
function logApiCall(functionName, data, response) {
  console.log(`${functionName} called with data:`, JSON.stringify(data));
  console.log(`${functionName} response:`, JSON.stringify(response));
}

/**
 * Get knowledge article by slug V2
 */
exports.learnV2_getKnowledgeArticleBySlug = functions.https.onCall(async (data) => {
  // Properly handle null data
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
 * List knowledge articles by category V2
 */
exports.learnV2_listKnowledgeArticlesByCategory = functions.https.onCall(async (data) => {
  // Properly handle null data
  if (!data || !data.category) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a valid category parameter.'
    );
  }

  const category = data.category;
  const limit = data.limit || 10; // Default to 10 articles
  
  try {
    // Get all articles first, then filter in memory to avoid compound index issues
    const snapshot = await articlesCollection.get();
    
    // Filter articles in the specified category
    let articles = [];
    snapshot.forEach(doc => {
      const articleData = doc.data();
      if (articleData.category === category) {
        articles.push({
          id: doc.id,
          ...articleData
        });
      }
    });
    
    // Sort by publicationDate (newest first)
    articles.sort((a, b) => {
      const dateA = a.publicationDate ? new Date(a.publicationDate) : new Date(0);
      const dateB = b.publicationDate ? new Date(b.publicationDate) : new Date(0);
      return dateB - dateA;
    });
    
    // Apply limit
    articles = articles.slice(0, limit);
    
    // Return array directly
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
 * List all knowledge categories V2
 */
exports.learnV2_listKnowledgeCategories = functions.https.onCall(async (data) => {
  // Function works with or without data parameter
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
    const categoriesArray = Array.from(categoriesSet).sort();
    
    // Transform string categories into objects as expected by the iOS app
    const categories = categoriesArray.map(category => ({
      id: category.toLowerCase().replace(/\s+/g, '-'),
      name: category,
      count: 0 // We can update this if needed
    }));
    
    // Return categories array directly
    const result = categories;
    logApiCall('learnV2_listKnowledgeCategories', data, result);
    return result;
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
 * Get featured articles V2
 */
exports.learnV2_getFeaturedArticles = functions.https.onCall(async (data) => {
  // Properly handle null data
  const limit = data && data.limit ? data.limit : 3; // Default to 3 featured articles
  
  try {
    // Get all articles first, then filter in memory instead of using a compound query
    const snapshot = await articlesCollection.get();
    
    // Filter featured articles in memory and sort by publicationDate
    let featuredArticles = [];
    snapshot.forEach(doc => {
      const articleData = doc.data();
      if (articleData.isFeatured === true) {
        featuredArticles.push({
          id: doc.id,
          ...articleData
        });
      }
    });
    
    // Sort by publicationDate (newest first)
    featuredArticles.sort((a, b) => {
      const dateA = a.publicationDate ? new Date(a.publicationDate) : new Date(0);
      const dateB = b.publicationDate ? new Date(b.publicationDate) : new Date(0);
      return dateB - dateA;
    });
    
    // Apply limit
    featuredArticles = featuredArticles.slice(0, limit);
    
    // Return array directly
    const result = featuredArticles;
    logApiCall('learnV2_getFeaturedArticles', data, result);
    return result;
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
 * Search knowledge articles V2
 */
exports.learnV2_searchKnowledgeArticles = functions.https.onCall(async (data) => {
  // Properly handle null data
  if (!data || !data.query) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a valid query parameter.'
    );
  }

  const query = data.query.toLowerCase();
  const limit = data.limit || 10; // Default to 10 results
  
  try {
    // Get all articles
    const snapshot = await articlesCollection.get();
    
    // Filter articles that match the search query
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
    results.sort((a, b) => {
      const aTitleMatch = a.title.toLowerCase().includes(query);
      const bTitleMatch = b.title.toLowerCase().includes(query);
      
      if (aTitleMatch && !bTitleMatch) return -1;
      if (!aTitleMatch && bTitleMatch) return 1;
      
      // If both match or don't match in the title, sort by date
      return new Date(b.publicationDate) - new Date(a.publicationDate);
    });
    
    // Apply the limit
    const limitedResults = results.slice(0, limit);
    
    // Return array directly
    const result = limitedResults;
    logApiCall('learnV2_searchKnowledgeArticles', data, result);
    return result;
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
 * Get latest articles V2
 */
exports.learnV2_getLatestArticles = functions.https.onCall(async (data) => {
  // Properly handle null data
  const limit = data && data.limit ? data.limit : 5; // Default to 5 latest articles
  
  try {
    // Get all articles, then sort in memory to avoid compound index requirements
    const snapshot = await articlesCollection.get();
    
    // Extract all articles
    let articles = [];
    snapshot.forEach(doc => {
      articles.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort by publicationDate (newest first)
    articles.sort((a, b) => {
      const dateA = a.publicationDate ? new Date(a.publicationDate) : new Date(0);
      const dateB = b.publicationDate ? new Date(b.publicationDate) : new Date(0);
      return dateB - dateA;
    });
    
    // Apply limit
    articles = articles.slice(0, limit);
    
    // Return array directly
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
