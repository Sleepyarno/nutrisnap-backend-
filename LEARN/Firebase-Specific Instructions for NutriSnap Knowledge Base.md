# Firebase-Specific Instructions for NutriSnap Knowledge Base

**Objective:** To guide your backend developer in importing the provided NutriSnap knowledge base articles into Firestore and serving them via Firebase Functions (Node.js) to your Xcode frontend. This document assumes a Firebase project is already set up.

**Prerequisites:**

*   Firebase project created and configured.
*   Node.js and npm/yarn installed locally for Firebase Functions development.
*   Firebase CLI installed and authenticated (`firebase login`).
*   Firebase Admin SDK initialized in your functions environment for Firestore access.
*   Provided files:
    *   `firestore_knowledge_base_data_model.md` (Defines Firestore document structure)
    *   `nutrisnap_knowledge_base_design.md` (Overall app tab design and structure)
    *   `short_article_what_is_a_glucose_spike.md`
    *   `long_article_metabolic_health_beyond_diabetes.md`
    *   Other `research_*.md` files (optional, for a deeper research section)

--- 

## Phase 1: Preparing Content and Firestore

### 1.1. Review Firestore Data Model

Familiarize yourself with the proposed data model in `firestore_knowledge_base_data_model.md`. The primary collection will be `knowledgeBaseArticles`.

### 1.2. Prepare Markdown Files with Front-Matter

To easily extract metadata for Firestore, add YAML front-matter to the beginning of each Markdown article file (`.md`).

**Example for `short_article_what_is_a_glucose_spike.md`:**

```yaml
---
title: "What is a Glucose Spike?"
slug: "what-is-a-glucose-spike"
articleType: "short"
category: "Glucose 101"
summary: "Learn what causes blood sugar spikes and their impact on your daily energy and long-term health."
keyTakeaway: "Understanding and managing glucose spikes is a key aspect of metabolic health for everyone."
tags: ["glucose", "sugar spike", "blood sugar", "energy"]
isFeatured: false
publicationDate: "2025-05-07T10:00:00Z" # ISO 8601 format
---
(Rest of the Markdown content...)
```

**Example for `long_article_metabolic_health_beyond_diabetes.md`:**

```yaml
---
title: "Metabolic Health: Beyond Weight and Diabetes"
slug: "metabolic-health-beyond-diabetes"
articleType: "long"
category: "Metabolic Health Essentials"
summary: "An in-depth look at metabolic health, its core components, the role of glucose, and lifestyle strategies for optimization."
estimatedReadTime: "12-15 minutes"
tableOfContents: true
referencesPresent: true # Indicates references are in the content or a separate field
tags: ["metabolic health", "insulin resistance", "cgm", "lifestyle", "nutrition"]
isFeatured: true
publicationDate: "2025-05-07T10:00:00Z" # ISO 8601 format
---
(Rest of the Markdown content, including Table of Contents and References sections...)
```

*   Create a local directory (e.g., `knowledge_base_md_files`) and place all prepared `.md` files there.

--- 

## Phase 2: Node.js Script for Firestore Data Seeding

This script will read your prepared Markdown files and populate the `knowledgeBaseArticles` collection in Firestore. Run this script locally using Node.js, not as a Firebase Function.

### 2.1. Install Dependencies

```bash
npm install firebase-admin gray-matter fs path
# or
yarn add firebase-admin gray-matter fs path
```

### 2.2. Create `seedFirestore.js` Script

```javascript
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter"); // For parsing front-matter

// **IMPORTANT**: Initialize Firebase Admin SDK
// Replace with your actual service account key path and database URL
const serviceAccount = require("./path/to/your-service-account-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://your-project-id.firebaseio.com" // Optional, if using Realtime Database too
});

const db = admin.firestore();
const articlesCollection = db.collection("knowledgeBaseArticles");

// Path to your directory with prepared .md files
const articlesDir = path.join(__dirname, "knowledge_base_md_files");

async function seedDatabase() {
  try {
    const files = fs.readdirSync(articlesDir);

    for (const file of files) {
      if (path.extname(file) === ".md") {
        const filePath = path.join(articlesDir, file);
        const fileContent = fs.readFileSync(filePath, "utf8");
        const { data: frontMatter, content: markdownContent } = matter(fileContent);

        if (!frontMatter.slug) {
          console.warn(`Skipping ${file} due to missing slug in front-matter.`);
          continue;
        }

        const articleData = {
          ...frontMatter, // Spread all front-matter fields
          content: markdownContent, // The actual Markdown body
          // Ensure dates are Firestore Timestamps if needed, or store as ISO strings
          publicationDate: frontMatter.publicationDate ? new Date(frontMatter.publicationDate) : admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Use slug as document ID for easy retrieval, or let Firestore auto-generate IDs
        await articlesCollection.doc(frontMatter.slug).set(articleData);
        console.log(`Imported: ${frontMatter.title} (slug: ${frontMatter.slug})`);
      }
    }
    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

seedDatabase().then(() => console.log("Script finished."));

```

**Before running:**

*   Replace `./path/to/your-service-account-key.json` with the actual path to your Firebase service account key JSON file.
*   Ensure the `articlesDir` points to your directory of prepared `.md` files.
*   Run the script: `node seedFirestore.js`

--- 

## Phase 3: Firebase Functions for Serving Content

In your Firebase Functions project (`functions/index.js` or separated into modules):

### 3.1. Initialize Firebase Admin (if not already done in your `index.js`)

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();
const articlesCollection = db.collection("knowledgeBaseArticles");

// Optional: For parsing Markdown to HTML on the backend
// const marked = require("marked"); 
// const { JSDOM } = require("jsdom");
// const createDOMPurify = require("dompurify");
// const { window } = new JSDOM("");
// const DOMPurify = createDOMPurify(window);
```

### 3.2. Function: Get Article by Slug

```javascript
exports.getKnowledgeArticleBySlug = functions.https.onCall(async (data, context) => {
  const slug = data.slug;
  if (!slug) {
    throw new functions.https.HttpsError("invalid-argument", "Slug is required.");
  }

  try {
    const doc = await articlesCollection.doc(slug).get();
    if (!doc.exists) {
      throw new functions.https.HttpsError("not-found", "Article not found.");
    }
    let article = doc.data();
    
    // Decision: Send raw Markdown or parsed HTML/JSON?
    // Option 1: Send raw Markdown (frontend handles rendering)
    // return article;

    // Option 2: Parse Markdown to HTML on backend (example)
    /*
    if (article.content) {
      const rawHtml = marked.parse(article.content);
      article.htmlContent = DOMPurify.sanitize(rawHtml);
      delete article.content; // Optionally remove raw markdown if sending HTML
    }
    return article;
    */
   
    // For now, let's assume frontend handles Markdown rendering
    return article;

  } catch (error) {
    console.error("Error fetching article:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", "Could not fetch article.");
  }
});
```

### 3.3. Function: List Articles by Category

```javascript
exports.listKnowledgeArticlesByCategory = functions.https.onCall(async (data, context) => {
  const category = data.category;
  if (!category) {
    throw new functions.https.HttpsError("invalid-argument", "Category is required.");
  }

  try {
    const snapshot = await articlesCollection
      .where("category", "==", category)
      .orderBy("publicationDate", "desc") // Example ordering
      .get();

    if (snapshot.empty) {
      return [];
    }

    const articles = [];
    snapshot.forEach(doc => {
      let articleData = doc.data();
      // Send only necessary fields for list view (e.g., title, slug, summary, articleType)
      articles.push({
        id: doc.id, // or slug
        title: articleData.title,
        slug: articleData.slug,
        summary: articleData.summary,
        articleType: articleData.articleType,
        category: articleData.category,
        publicationDate: articleData.publicationDate // Keep as Firestore Timestamp or convert to ISO string
      });
    });
    return articles;
  } catch (error) {
    console.error("Error listing articles by category:", error);
    throw new functions.https.HttpsError("internal", "Could not list articles.");
  }
});
```

### 3.4. Function: List All Categories

```javascript
exports.listKnowledgeCategories = functions.https.onCall(async (data, context) => {
  try {
    // This approach derives categories from existing articles.
    // For a more robust solution, maintain a separate `knowledgeBaseCategories` collection.
    const snapshot = await articlesCollection.get();
    if (snapshot.empty) {
      return [];
    }
    const categorySet = new Set();
    snapshot.forEach(doc => {
      if (doc.data().category) {
        categorySet.add(doc.data().category);
      }
    });
    return Array.from(categorySet).map(cat => ({ name: cat, slug: cat.toLowerCase().replace(/\s+/g, "-") })); // Simple slugification
  } catch (error) {
    console.error("Error listing categories:", error);
    throw new functions.https.HttpsError("internal", "Could not list categories.");
  }
});
```

### 3.5. Function: Search Articles (Basic)

Firestore is not ideal for full-text search. For robust search, integrate a dedicated search service like Algolia or Typesense, triggered by Firestore updates.
Here’s a very basic example (case-sensitive, limited to tags or title prefix, not full-text on content).

```javascript
exports.searchKnowledgeArticles = functions.https.onCall(async (data, context) => {
  const query = data.query;
  if (!query || query.length < 3) { // Basic validation
    throw new functions.https.HttpsError("invalid-argument", "Search query must be at least 3 characters.");
  }

  try {
    // Example: Search by tag (array-contains)
    const tagSearchSnapshot = await articlesCollection
                                .where("tags", "array-contains", query.toLowerCase())
                                .limit(10)
                                .get();
    
    let articles = [];
    tagSearchSnapshot.forEach(doc => {
        let articleData = doc.data();
        articles.push({ id: doc.id, title: articleData.title, slug: articleData.slug, summary: articleData.summary });
    });

    // You might want to add another query for title, etc., and merge results.
    // This is very basic. For real search, use Algolia/Typesense.
    return articles;

  } catch (error) {
    console.error("Error searching articles:", error);
    throw new functions.https.HttpsError("internal", "Could not search articles.");
  }
});
```

--- 

## Phase 4: Deployment and Testing

1.  **Deploy Functions:**
    ```bash
    firebase deploy --only functions
    ```
2.  **Testing:**
    *   Your Xcode frontend will call these HTTPS Callable Functions.
    *   You can also test them using the Firebase Local Emulator Suite or by crafting test calls from a client environment.

--- 

## Important Considerations for Xcode Frontend:

*   **Markdown Rendering:** If your Firebase Functions send raw Markdown, your Xcode app will need a library to parse and render it natively (e.g., using libraries that convert Markdown to `NSAttributedString` or display it in a `WKWebView` after client-side conversion to HTML).
*   **API Calls:** Ensure your Xcode app makes appropriate calls to these Firebase Functions to fetch and display the knowledge base content according to the `nutrisnap_knowledge_base_design.md`.
*   **Table of Contents (Long Articles):** If `tableOfContents` is true, the frontend will need to generate this from the Markdown headings or expect a pre-structured ToC if you modify the backend to provide it.

This guide provides a starting point. You will likely need to refine the functions, error handling, and data structures based on the specific needs and user experience of your NutriSnap app.
