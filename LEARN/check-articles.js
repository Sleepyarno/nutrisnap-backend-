/**
 * Script to check if featured articles exist in Firestore and their format
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize admin with service account credentials
try {
  admin.initializeApp({
    projectId: 'nutrisnap2'
  });
} catch (e) {
  console.log('Admin already initialized');
}

const db = admin.firestore();

async function checkArticles() {
  try {
    console.log('Checking if any articles exist...');
    const allArticles = await db.collection('knowledgeBaseArticles').get();
    console.log(`Total articles: ${allArticles.size}`);

    if (allArticles.size > 0) {
      console.log('Sample article data:');
      allArticles.docs[0] && console.log(JSON.stringify(allArticles.docs[0].data(), null, 2));
    }

    console.log('\nChecking for featured articles with field "isFeatured"...');
    const featuredIsFeatured = await db.collection('knowledgeBaseArticles')
      .where('isFeatured', '==', true)
      .get();
    console.log(`Articles with isFeatured=true: ${featuredIsFeatured.size}`);

    console.log('\nChecking for featured articles with field "featured"...');
    const featuredFeatured = await db.collection('knowledgeBaseArticles')
      .where('featured', '==', true)
      .get();
    console.log(`Articles with featured=true: ${featuredFeatured.size}`);

    // Print one article of each type if available
    if (featuredIsFeatured.size > 0) {
      console.log('\nSample article with isFeatured=true:');
      console.log(JSON.stringify(featuredIsFeatured.docs[0].data(), null, 2));
    }

    if (featuredFeatured.size > 0) {
      console.log('\nSample article with featured=true:');
      console.log(JSON.stringify(featuredFeatured.docs[0].data(), null, 2));
    }

    // Check article fields for any case variations
    console.log('\nChecking all article fields for variations...');
    const allFields = new Set();
    allArticles.forEach(doc => {
      const data = doc.data();
      Object.keys(data).forEach(key => allFields.add(key));
    });
    console.log('All fields found:', Array.from(allFields).join(', '));

  } catch (error) {
    console.error('Error checking articles:', error);
  }
}

checkArticles()
  .then(() => console.log('Done checking articles'))
  .catch(err => console.error('Error running script:', err));
