/**
 * NutriSnap Learn Tab Functions
 * 
 * This module integrates the Learn tab functions from the LEARN directory
 * into the main application without affecting the food detection functionality.
 * 
 * IMPORTANT: These functions use Firebase Functions v1 (1st Gen) format
 * to maintain compatibility with the original Learn tab implementation.
 */

// Use v1 functions to maintain compatibility
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Reference to Firestore database
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Get knowledge article by slug
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
      .orderBy('publicationDate', 'desc')
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
 */
exports.learn_listKnowledgeCategories = functions.https.onCall(async () => {
  try {
    // Query Firestore for all articles to extract unique categories
    const snapshot = await articlesCollection.get();
    
    // Extract unique categories with their IDs
    const categoriesMap = new Map();
    snapshot.forEach(doc => {
      const data = doc.data();
      const category = data.category;
      if (category) {
        categoriesMap.set(category, category);
      }
    });
    
    // Convert Map to Array of objects with name and id/slug properties
    // Format the data as expected by the iOS app
    const categories = Array.from(categoriesMap.values()).map(category => {
      return {
        name: category,
        id: category.toLowerCase().replace(/\s+/g, '-'),  // Create slug from name
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    
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
 */
exports.learn_getFeaturedArticles = functions.https.onCall(async (data = null) => {
  // Default to 3 featured articles if data is null or limit is not specified
  const limit = data && data.limit ? data.limit : 3;
  
  try {
    // Query Firestore for all articles - avoiding the composite index requirement
    // We'll filter and sort in-memory instead of using multiple Firestore query conditions
    const snapshot = await articlesCollection.get();
    
    // Check if any articles were found
    if (snapshot.empty) {
      return []; // Return an empty array if no articles found
    }
    
    // Filter and map the query results in memory
    const articles = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Only include featured articles
      if (data.featured === true) {
        articles.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    // Sort by publication date (newest first)
    articles.sort((a, b) => {
      const dateA = a.publicationDate ? new Date(a.publicationDate) : new Date(0);
      const dateB = b.publicationDate ? new Date(b.publicationDate) : new Date(0);
      return dateB - dateA; // descending order
    });
    
    // Apply the limit
    return articles.slice(0, limit);
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
 */
exports.learn_getLatestArticles = functions.https.onCall(async (data = null) => {
  const limit = data && data.limit ? data.limit : 5; // Default to 5 latest articles
  
  try {
    // Query Firestore for the latest articles
    const snapshot = await articlesCollection
      .orderBy('publicationDate', 'desc')
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
