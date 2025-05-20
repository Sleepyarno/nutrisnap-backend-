/**
 * Learn Tab Adapter - Compatibility layer for NutriSnap iOS app
 * 
 * This module provides adapter functions that ensure proper data 
 * formatting for the iOS app regardless of the underlying data structure.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Reference to Firestore database
const db = admin.firestore();
const articlesCollection = db.collection('knowledgeBaseArticles');

/**
 * Adapter function for featured articles that ensures proper data format
 * and provides fallback content to prevent iOS app crashes
 */
exports.learn_getFeaturedArticlesAdapter = functions
  .runWith({
    memory: '512MB',
    timeoutSeconds: 120
  })
  .https.onCall(async (data = null) => {
    const limit = data && data.limit ? data.limit : 3;
    
    try {
      console.log('Running learn_getFeaturedArticlesAdapter');
      
      // Try to fetch articles marked with isFeatured: true first
      let snapshot = await articlesCollection
        .where('isFeatured', '==', true)
        .orderBy('publicationDate', 'desc') // Ensure an index exists for this
        .limit(limit)
        .get();

      // If no articles found with isFeatured, try with 'featured: true' as a fallback
      if (snapshot.empty) {
        console.log('No articles found with isFeatured: true, trying featured: true');
        snapshot = await articlesCollection
          .where('featured', '==', true)
          .orderBy('publicationDate', 'desc') // Ensure an index exists for this
          .limit(limit)
          .get();
      }

      const articles = [];
      if (!snapshot.empty) {
        snapshot.forEach(doc => {
          const data = doc.data();
          let pubDate;
          const originalPubDate = data.publicationDate;

          if (originalPubDate && typeof originalPubDate.toDate === 'function') {
            // It's a Firestore Timestamp
            pubDate = originalPubDate.toDate().toISOString();
          } else if (typeof originalPubDate === 'string' && originalPubDate.length > 0) {
            // It's a string, try to parse and re-format to "YYYY-MM-DDTHH:mm:ss.sssZ"
            const dateObj = new Date(originalPubDate);
            if (!isNaN(dateObj.getTime())) { // Check if date string was valid
              pubDate = dateObj.toISOString();
            } else {
              console.warn(`Article ${doc.id} (${data.title || 'N/A'}) has unparseable publicationDate string: "${originalPubDate}". Defaulting to current time.`);
              pubDate = new Date().toISOString(); // Default to now
            }
          } else {
            // Not a Timestamp, not a string, or null/undefined/empty string
            console.warn(`Article ${doc.id} (${data.title || 'N/A'}) has invalid or missing publicationDate: "${originalPubDate}". Defaulting to current time.`);
            pubDate = new Date().toISOString(); // Default to now
          }

          articles.push({
            id: doc.id,
            title: data.title || '',
            content: data.content || '',
            category: data.category || '',
            slug: data.slug || '',
            articleType: data.articleType && (data.articleType === 'short' || data.articleType === 'long') ? data.articleType : 'short',
            isFeatured: true,
            featured: true,
            publicationDate: pubDate,
            imageUrl: data.imageUrl || '',
            tags: Array.isArray(data.tags) ? data.tags : []
          });
        });
      } else if (!process.env.FUNCTIONS_EMULATOR) {
        console.log('No featured articles found in database (production), using fallback logic to fetch any recent articles.');
        // In production, if no articles are found by isFeatured/featured, try the robust fallback.
        return getFallbackFeaturedArticles(db, limit);
      }

      // If still no articles (e.g. empty database, even in emulator, or fallback also returned empty),
      // provide a very basic hardcoded fallback to prevent empty array if possible,
      // which might be better for client handling than a completely empty response.
      if (articles.length === 0) {
        console.log('No featured articles found by any query, providing hardcoded fallback.');
        articles.push({
          id: 'fallback-article-no-data',
          title: 'Discover NutriSnap Insights',
          content: 'Welcome to our Learn section! Fresh articles are coming soon. Check back later for exciting content on metabolic health and nutrition.',
          category: 'General Information',
          slug: 'welcome-learn-section',
          articleType: 'short',
          isFeatured: true,
          featured: true,
          publicationDate: new Date().toISOString(),
          imageUrl: '', // Consider having a default placeholder image URL
          tags: ['health', 'nutrition', 'comingsoon'],
        });
      }
      
      console.log(`Returning ${articles.length} articles`);
      return articles;
      
    } catch (error) {
      console.error('Error in adapter function:', error);
      
      // Always return something valid to prevent app crashes
      return [{
        id: 'error-article',
        title: 'Featured Content',
        content: 'Please check back soon for featured content.',
        category: 'General',
        slug: 'featured-content',
        articleType: 'long',
        isFeatured: true,
        featured: true,
        publicationDate: new Date().toISOString(),
        imageUrl: '',
        tags: []
      }];
    }
  });

const getFallbackFeaturedArticles = async (db, limit = 2) => {
  try {
    // Fallback: Get any 'limit' articles, ordered by publicationDate descending
    // This ensures some content is returned if the 'isFeatured' flag is missing or no articles are explicitly featured
    const snapshot = await db.collection('knowledgeBaseArticles')
      .orderBy('publicationDate', 'desc')
      .limit(limit)
      .get();

    const articles = [];
    if (!snapshot.empty) {
      snapshot.forEach(doc => {
        const data = doc.data();
        let pubDate;
        const originalPubDate = data.publicationDate;

        if (originalPubDate && typeof originalPubDate.toDate === 'function') {
          pubDate = originalPubDate.toDate().toISOString();
        } else if (typeof originalPubDate === 'string' && originalPubDate.length > 0) {
          const dateObj = new Date(originalPubDate);
          if (!isNaN(dateObj.getTime())) {
            pubDate = dateObj.toISOString();
          } else {
            console.warn(`Fallback Article ${doc.id} (${data.title || 'N/A'}) has unparseable publicationDate string: "${originalPubDate}". Defaulting to current time.`);
            pubDate = new Date().toISOString();
          }
        } else {
          console.warn(`Fallback Article ${doc.id} (${data.title || 'N/A'}) has invalid/missing publicationDate: "${originalPubDate}". Defaulting to current time.`);
          pubDate = new Date().toISOString();
        }

        articles.push({
          id: doc.id,
          title: data.title || 'Untitled Article',
          content: data.content || 'No content available.',
          category: data.category || 'General',
          slug: data.slug || doc.id,
          articleType: data.articleType && (data.articleType === 'short' || data.articleType === 'long') ? data.articleType : 'short',
          isFeatured: data.isFeatured || data.featured || false, // Attempt to honor original, else false
          featured: data.isFeatured || data.featured || false,
          publicationDate: pubDate,
          imageUrl: data.imageUrl || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
        });
      });
    }

    if (articles.length === 0) {
      // Ultimate fallback if even the generic query fails
      console.log('Fallback query also found no articles, providing hardcoded ultimate fallback.');
      articles.push({
        id: 'ultimate-fallback-article',
        title: 'Explore Our Knowledge Base',
        content: 'Content is being updated. Please visit again shortly to explore articles on health and nutrition.',
        category: 'Updates',
        slug: 'content-updates',
        articleType: 'short',
        isFeatured: false, // Not strictly "featured" but a fallback
        featured: false,
        publicationDate: new Date().toISOString(),
        imageUrl: '',
        tags: ['info'],
      });
    }
    return articles;
  } catch (error) {
    console.error('Error in getFallbackFeaturedArticles:', error);
    return [];
  }
};
