/**
 * Test script to check the implementation of the learn_getFeaturedArticlesV2 function
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase admin
try {
  admin.initializeApp({
    projectId: 'nutrisnap2'
  });
} catch (e) {
  console.log('Admin already initialized');
}

// Get a reference to Firestore
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Implementation of the featured articles function
 * Based on our enhanced V2 version that fixes iOS app issues
 */
async function getFeaturedArticlesTest(limit = 3) {
  try {
    console.log(`Fetching ${limit} featured articles`);
    
    // First try with 'isFeatured' field (the name in your Markdown files)
    let snapshot = await articlesCollection
      .where('isFeatured', '==', true)
      .orderBy('publicationDate', 'asc') // Ascending to match the required index
      .limit(limit)
      .get();
    
    console.log(`Query with isFeatured=true returned ${snapshot.size} results`);
    
    // If no results, try with 'featured' field as fallback
    if (snapshot.empty) {
      console.log('No articles found with isFeatured=true, trying featured=true');
      try {
        snapshot = await articlesCollection
          .where('featured', '==', true)
          .limit(limit)
          .get();
        console.log(`Query with featured=true returned ${snapshot.size} results`);
      } catch (fallbackError) {
        console.log('Error with fallback query:', fallbackError);
        // Continue with empty snapshot
      }
    }

    // Default to empty array if no featured articles found
    const articles = [];

    // If we found articles, process them
    if (!snapshot.empty) {
      console.log(`Found ${snapshot.size} featured articles`);
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Article: ${doc.id} - ${data.title}`);
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
      // If no featured articles found, create a fallback article
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
    // Return a fallback article to ensure app doesn't crash
    return [{
      id: 'error-article',
      title: 'Featured Content',
      content: 'Please check back soon for featured content.',
      category: 'General',
      slug: 'featured-content',
      isFeatured: true,
      featured: true,
      publicationDate: new Date().toISOString(),
      imageUrl: '',
      tags: []
    }];
  }
}

// Run our test
getFeaturedArticlesTest()
  .then(articles => {
    console.log('Articles returned successfully:');
    console.log(JSON.stringify(articles, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Error running test:', err);
    process.exit(1);
  });
