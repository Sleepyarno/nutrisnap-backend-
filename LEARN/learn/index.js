/**
 * NutriSnap Learn Tab - Standalone Functions
 * This is a lean implementation of the Learn tab that can be deployed independently
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Reference to Firestore database
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Get featured articles - Enhanced version that checks both field names and ensures valid response
 */
exports.learnv2_getFeaturedArticles = functions.https.onCall(async (data = null) => {
  // Default to 3 featured articles
  const limit = data && data.limit ? data.limit : 3;
  
  try {
    console.log('Fetching featured articles');
    
    // First try with 'isFeatured' field (the name in your Markdown files)
    let snapshot = await articlesCollection
      .where('isFeatured', '==', true)
      .orderBy('publicationDate', 'asc') 
      .limit(limit)
      .get();
    
    // If no results, try with 'featured' field as fallback
    if (snapshot.empty) {
      console.log('No articles found with isFeatured=true, trying featured=true');
      snapshot = await articlesCollection
        .where('featured', '==', true)
        .limit(limit)
        .get();
    }
    
    // Default to empty array if no featured articles found
    const articles = [];

    // If we found articles, process them
    if (!snapshot.empty) {
      console.log(`Found ${snapshot.size} featured articles`);
      snapshot.forEach(doc => {
        const data = doc.data();
        articles.push({
          id: doc.id,
          title: data.title || '',
          content: data.content || '',
          category: data.category || '',
          slug: data.slug || '',
          isFeatured: true, // Always set this to true in response
          featured: true,    // Include both field names for compatibility
          publicationDate: data.publicationDate || new Date().toISOString(),
          imageUrl: data.imageUrl || '',
          tags: Array.isArray(data.tags) ? data.tags : []
        });
      });
    } else {
      // If no featured articles found, provide a fallback article
      console.log('No featured articles found in database, using fallback');
      articles.push({
        id: 'sample-article',
        title: 'Metabolic Health: Beyond Weight and Diabetes',
        content: 'This is a sample article to demonstrate the Learn tab functionality.',
        category: 'Metabolic Health Essentials',
        slug: 'metabolic-health-beyond-diabetes',
        isFeatured: true,
        featured: true,
        publicationDate: new Date().toISOString(),
        imageUrl: '',
        tags: ['metabolic health', 'insulin resistance']
      });
    }
    
    console.log(`Returning ${articles.length} articles`);
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
 * Original function name - redirects to our V2 implementation for compatibility
 */
exports.learn_getFeaturedArticles = functions.https.onCall(async (data = null) => {
  console.log('Forwarding call from learn_getFeaturedArticles to learnv2_getFeaturedArticles');
  
  try {
    // Call our V2 implementation with the same data
    const articles = await exports.learnv2_getFeaturedArticles.run(data);
    return articles;
  } catch (error) {
    console.error('Error in forwarding function:', error);
    // Return a fallback empty array to avoid app crashes
    return [];
  }
});

/**
 * List all knowledge categories available in the knowledgeBaseArticles collection
 */
exports.learn_listKnowledgeCategories = functions.https.onCall(async (data = null) => {
  try {
    console.log('Fetching knowledge categories');
    
    // Get all articles
    const snapshot = await articlesCollection.get();
    
    // Extract unique categories
    const categoriesSet = new Set();
    
    if (!snapshot.empty) {
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.category) {
          categoriesSet.add(data.category);
        }
      });
    }
    
    // Convert Set to Array and sort alphabetically
    const categories = Array.from(categoriesSet).sort();
    
    console.log(`Found ${categories.length} categories`);
    return categories;
  } catch (error) {
    console.error('Error fetching knowledge categories:', error);
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while fetching knowledge categories.',
      error
    );
  }
});
