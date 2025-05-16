/**
 * NutriSnap Learn Tab Functions - Optimized Version
 * 
 * This module provides memory-optimized versions of the Learn tab functions
 * that minimize resource usage and avoid the timeout issues during deployment.
 * 
 * IMPORTANT: These functions use Firebase Functions v1 (1st Gen) format
 * to maintain compatibility with the original Learn tab implementation.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Configure with higher memory limits
const runtimeOpts = {
  memory: '1GB',
  timeoutSeconds: 300
};

// Reference to Firestore database
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Get knowledge article by slug - Optimized version
 */
exports.getKnowledgeArticleBySlug = functions
  .runWith(runtimeOpts)
  .https.onCall(async (data) => {
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
      
      // Return the article data formatted for iOS app compatibility
      const articleDoc = snapshot.docs[0];
      const data = articleDoc.data();
      return {
        id: articleDoc.id,
        title: data.title || '',
        content: data.content || '',
        category: data.category || '',
        slug: data.slug || '',
        featured: data.featured || false,
        publicationDate: data.publicationDate && data.publicationDate.toDate ? data.publicationDate.toDate().toISOString() : new Date().toISOString(),
        imageUrl: data.imageUrl || '',
        tags: Array.isArray(data.tags) ? data.tags : []
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
 * List knowledge articles by category - Optimized version
 */
exports.listKnowledgeArticlesByCategory = functions
  .runWith(runtimeOpts)
  .https.onCall(async (data) => {
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
      
      // Map the query results and format for iOS app compatibility
      const articles = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        articles.push({
          id: doc.id,
          title: data.title || '',
          content: data.content || '',
          category: data.category || '',
          slug: data.slug || '',
          featured: data.featured || false,
          publicationDate: data.publicationDate && data.publicationDate.toDate ? data.publicationDate.toDate().toISOString() : new Date().toISOString(),
          imageUrl: data.imageUrl || '',
          tags: Array.isArray(data.tags) ? data.tags : []
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
 * List all knowledge categories - Optimized version
 */
exports.listKnowledgeCategories = functions
  .runWith(runtimeOpts)
  .https.onCall(async () => {
    try {
      // TODO: PERFORMANCE - This approach fetches all articles to derive categories.
      // For larger datasets, consider maintaining a separate 'knowledgeBaseCategories' collection
      // or using Firestore aggregation queries if suitable.
      const snapshot = await articlesCollection.get();
      
      // Extract unique categories
      const categoriesSet = new Set();
      snapshot.forEach(doc => {
        const category = doc.data().category;
        if (category) {
          categoriesSet.add(category);
        }
      });
      
      // Convert Set to Array and format as objects to match iOS expectations
      const categories = Array.from(categoriesSet).sort().map(category => {
        return {
          name: category,
          id: category.toLowerCase().replace(/\s+/g, '-')
        };
      });
      
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
 * Search knowledge articles - Optimized version
 */
exports.searchKnowledgeArticles = functions
  .runWith(runtimeOpts)
  .https.onCall(async (data) => {
    if (!data || !data.query) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with a valid query parameter.'
      );
    }

    const query = data.query.toLowerCase();
    const limit = data.limit || 10; // Default to 10 results
    
    try {
      // TODO: PERFORMANCE - This approach fetches all articles and filters in memory.
      // This is highly inefficient for large datasets and will not scale.
      // For production, integrate a dedicated search service like Algolia or Typesense.
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
            title: data.title || '',
            content: data.content || '',
            category: data.category || '',
            slug: data.slug || '',
            featured: data.featured || false,
            publicationDate: data.publicationDate && data.publicationDate.toDate ? data.publicationDate.toDate().toISOString() : new Date().toISOString(),
            imageUrl: data.imageUrl || '',
            tags: Array.isArray(data.tags) ? data.tags : []
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
 * Get latest articles - Optimized version
 */
exports.getLatestArticles = functions
  .runWith(runtimeOpts)
  .https.onCall(async (data = null) => {
    const limit = data && data.limit ? data.limit : 5; // Default to 5 latest articles
    
    try {
      // Query Firestore for the latest articles
      const snapshot = await articlesCollection
        .orderBy('publicationDate', 'desc')
        .limit(limit)
        .get();
      
      // Check if any articles were found
      if (snapshot.empty) {
        console.log('No latest articles found');
        return []; // Return an empty array if no articles found
      }
      
      // Map the query results and format for iOS app compatibility
      const articles = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        articles.push({
          id: doc.id,
          title: data.title || '',
          content: data.content || '',
          category: data.category || '',
          slug: data.slug || '',
          featured: data.featured || false,
          isFeatured: data.isFeatured || false,
          publicationDate: data.publicationDate && data.publicationDate.toDate ? data.publicationDate.toDate().toISOString() : new Date().toISOString(),
          imageUrl: data.imageUrl || '',
          tags: Array.isArray(data.tags) ? data.tags : []
        });
      });
      
      return articles;
    } catch (error) {
      console.error('Error fetching latest articles:', error);
      // Return a fallback empty array to avoid app crashes
      return [];
    }
  });
