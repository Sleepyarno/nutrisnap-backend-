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
      
      // Use a simple query without complex ordering or multiple conditions to prevent timeout
      // Skip the orderBy which can cause index issues
      let snapshot;
      
      try {
        // Simple query with limit and no ordering to avoid index requirements
        snapshot = await articlesCollection
          .limit(limit * 3) // Get more items to filter client-side
          .get();
        
        console.log(`Basic query returned ${snapshot.size} articles`);
        
        // Do the featured filtering in memory to avoid index requirements
        if (!snapshot.empty) {
          const allDocs = snapshot.docs;
          const featuredDocs = allDocs.filter(doc => {
            const data = doc.data();
            return data.isFeatured === true || data.featured === true;
          }).slice(0, limit); // Limit to requested number
          
          // Create a synthetic snapshot with only featured articles
          snapshot = { 
            empty: featuredDocs.length === 0,
            size: featuredDocs.length,
            docs: featuredDocs,
            forEach: callback => featuredDocs.forEach(callback)
          };
          
          console.log(`Found ${snapshot.size} featured articles after filtering`);
        }
      } catch (error) {
        console.error('Error with articles query:', error);
        // Continue with empty snapshot
        snapshot = { empty: true, docs: [], size: 0, forEach: () => {} };
      }
      
      // If we found articles, process them
      const articles = [];
      
      if (snapshot && !snapshot.empty && snapshot.size > 0) {
        console.log(`Found ${snapshot.size} featured articles`);
        
        // Process the articles
        snapshot.forEach(doc => {
          const data = doc.data();
          articles.push({
            id: doc.id,
            title: data.title || '',
            content: data.content || '',
            category: data.category || '',
            slug: data.slug || '',
            isFeatured: true,
            featured: true,
            publicationDate: data.publicationDate && data.publicationDate.toDate ? data.publicationDate.toDate().toISOString() : new Date().toISOString(),
            imageUrl: data.imageUrl || '',
            tags: Array.isArray(data.tags) ? data.tags : []
          });
        });
      }
      
      // If no articles were found, create a fallback
      if (articles.length === 0) {
        console.log('No featured articles found, using fallback article');
        
        // Add a fallback article
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
      console.error('Error in adapter function:', error);
      
      // Always return something valid to prevent app crashes
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
  });
