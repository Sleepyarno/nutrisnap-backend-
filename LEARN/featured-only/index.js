const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Simple adapter function that fetches featured articles
exports.learn_getFeaturedArticles = functions
  .runWith({
    memory: '256MB',
    // Allow unauthenticated access temporarily for testing
    enforceAppCheck: false,
    ingressSettings: 'ALLOW_ALL'
  })
  .https.onCall(async (data = null) => {
    try {
      const limit = data?.limit || 10;
      console.log(`learn_getFeaturedArticles: Limit set to ${limit}`);
    
      // Reference to the articles collection
      const articlesCollection = db.collection('knowledgeBaseArticles');
      
      // First, check how many documents are in the collection
      const allDocs = await articlesCollection.get();
      console.log(`learn_getFeaturedArticles: Total documents in knowledgeBaseArticles: ${allDocs.size}`);

      // Try to query with isFeatured field
      let snapshot = await articlesCollection
        .where('isFeatured', '==', true)
        .limit(limit)
        .get();
      
      console.log(`learn_getFeaturedArticles: Query results with isFeatured=true: ${snapshot.size}`);
        
      // If no results, try with 'featured' field for compatibility
      if (snapshot.empty) {
        console.log('learn_getFeaturedArticles: No results with isFeatured=true, trying featured=true');
        snapshot = await articlesCollection
          .where('featured', '==', true)
          .limit(limit)
          .get();
          
        console.log(`learn_getFeaturedArticles: Query results with featured=true: ${snapshot.size}`);
      }
      
      // Always initialize articles array - iOS app expects a direct array of articles
      const articles = [];
      
      console.log('learn_getFeaturedArticles: Preparing articles array for iOS app');
      
      // Process results if any found
      if (!snapshot.empty) {
        console.log(`learn_getFeaturedArticles: Found ${snapshot.size} featured articles, processing...`);
        snapshot.forEach(doc => {
          const data = doc.data();
          console.log(`learn_getFeaturedArticles: Found featured article: ${doc.id}, title: ${data.title}`);
          
          // Process date properly for iOS compatibility
          let publicationDate;
          if (data.publicationDate) {
            if (typeof data.publicationDate === 'string') {
              publicationDate = data.publicationDate;
            } else if (data.publicationDate.toDate) {
              // Convert Firestore timestamp to ISO string
              publicationDate = data.publicationDate.toDate().toISOString();
            } else if (data.publicationDate._seconds) {
              // Handle Firestore timestamp format directly
              publicationDate = new Date(data.publicationDate._seconds * 1000).toISOString();
            } else {
              publicationDate = new Date().toISOString();
            }
          } else {
            publicationDate = new Date().toISOString();
          }
          
          // Add the article with all fields required by iOS app
          articles.push({
            id: doc.id,
            title: data.title || '',
            content: data.content || '',
            summary: data.summary || '',
            category: data.category || '',
            categoryName: data.category || '', // Required by iOS app
            slug: data.slug || '',
            // Use standard as the default articleType - this should match the Swift enum
            articleType: data.articleType || 'standard', 
            isFeatured: true,
            featured: true,
            publicationDate: publicationDate,
            imageUrl: data.imageUrl || '',
            tags: Array.isArray(data.tags) ? data.tags : []
          });
        });
      } else {
        // If no articles found in the database, provide a minimal fallback
        console.log('learn_getFeaturedArticles: No featured articles found, providing fallback response');
        
        // We'll get our fallback article IDs by looking at the available documents
        if (allDocs.size > 0) {
          // Use real documents from the database if available
          console.log('learn_getFeaturedArticles: Using existing documents for fallback');
          let counter = 0;
          allDocs.forEach(doc => {
            if (counter < limit) {
              const data = doc.data();
              console.log(`learn_getFeaturedArticles: Adding fallback article from existing doc: ${doc.id}`);
              articles.push({
                id: doc.id,
                title: data.title || 'Featured Article',
                content: data.content || 'Content will be available soon.',
                summary: data.summary || 'Coming soon',
                category: data.category || 'General',
                categoryName: data.category || 'General', // Required by iOS app
                slug: data.slug || doc.id,
                articleType: data.articleType || 'standard', // Required by iOS app - must match Swift enum
                isFeatured: true, 
                featured: true,
                publicationDate: data.publicationDate ? 
                  (typeof data.publicationDate === 'string' ? data.publicationDate : 
                   data.publicationDate.toDate ? data.publicationDate.toDate().toISOString() : 
                   new Date().toISOString()) : new Date().toISOString(),
                imageUrl: data.imageUrl || '',
                tags: Array.isArray(data.tags) ? data.tags : []
              });
              counter++;
            }
          });
        }
        
        // Final fallback if still no articles
        if (articles.length === 0) {
          console.log('learn_getFeaturedArticles: No documents found at all, returning minimal fallback');
          articles.push({
            id: 'temporary-article',
            title: 'Coming Soon',
            content: 'New articles will be available soon.',
            summary: 'Coming soon',
            category: 'General',
            categoryName: 'General', // Required by iOS app
            slug: 'coming-soon',
            articleType: 'standard', // Required by iOS app - must match Swift enum
            isFeatured: true,
            featured: true,
            publicationDate: new Date().toISOString(),
            imageUrl: '',
            tags: []
          });
        }
      }
      
      console.log(`learn_getFeaturedArticles: Returning ${articles.length} articles`);
      return articles;
    } catch (error) {
      console.error('Error fetching featured articles:', error);
      // Return properly formatted empty array on error to avoid app crashes
      return [];
    }
  });
