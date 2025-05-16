# Firestore Data Model for NutriSnap Knowledge Base

This document outlines a recommended Firestore data model for storing and managing the NutriSnap knowledge base articles. This model is designed to work with a Firebase Functions (Node.js) backend and an Xcode frontend, aligning with the structure proposed in `nutrisnap_knowledge_base_design.md`.

## 1. Firestore Collections

We propose the following primary collection:

*   **`knowledgeBaseArticles`**: This collection will store each individual educational article.

Optionally, for more structured category management (especially if categories have descriptions or associated images), you could have a separate collection:

*   **`knowledgeBaseCategories`** (Optional): This collection would store details about each category.
    *   Fields: `categoryId` (String, e.g., "glucose-101"), `name` (String, e.g., "Glucose 101"), `description` (String, optional), `iconUrl` (String, optional).
    *   For simplicity in the initial setup, categories can be managed as string fields directly within the `knowledgeBaseArticles` documents. A separate collection can be added later if needed.

## 2. Document Structure for `knowledgeBaseArticles` Collection

Each document in the `knowledgeBaseArticles` collection will represent a single article and should contain the following fields:

*   **`title`**: (String)
    *   The main title of the article.
    *   Example: "What is a Glucose Spike?"
*   **`slug`**: (String)
    *   A URL-friendly version of the title, used for direct linking and easier querying. Should be unique.
    *   Example: "what-is-a-glucose-spike"
*   **`content`**: (String)
    *   The full Markdown content of the article.
    *   Example: "Ever felt that sudden energy slump... (full Markdown text here)"
*   **`articleType`**: (String)
    *   Indicates if the article is short-form or long-form.
    *   Values: "short", "long"
    *   Example: "short"
*   **`category`**: (String)
    *   The primary category the article belongs to. This aligns with the categories defined in `nutrisnap_knowledge_base_design.md`.
    *   Example: "Glucose 101"
    *   *Alternative for multiple categories:* Could be an Array of Strings if articles can belong to multiple categories: `categories: ["Glucose 101", "Nutrition Basics"]`.
*   **`tags`**: (Array of Strings, Optional)
    *   Keywords for enhanced searchability and filtering.
    *   Example: `["glucose", "sugar", "metabolism", "energy"]`
*   **`summary` / `snippet`**: (String, Optional)
    *   A brief summary or snippet of the article, useful for displaying in list views or search results.
    *   Example: "A quick explanation of what causes blood sugar spikes and why they matter for everyone."
*   **`estimatedReadTime`**: (String, Conditional - for `articleType: "long"`)
    *   Estimated time to read the article.
    *   Example: "12-15 minutes"
*   **`keyTakeaway`**: (String, Conditional - for `articleType: "short"`)
    *   A concise key takeaway message for short articles.
    *   Example: "Understanding and managing glucose spikes is a key aspect of metabolic health for everyone."
*   **`tableOfContents`**: (Boolean, Conditional - for `articleType: "long"`)
    *   Indicates if a table of contents should be generated/is available within the Markdown or expected by the frontend.
    *   Example: `true`
*   **`references`**: (String, Conditional - for `articleType: "long"`)
    *   Can store a Markdown formatted list of references, or a direct link to a references section if it is part of the main `content`.
    *   Alternatively, this could be an array of reference objects if more structured data is needed.
*   **`author`**: (String, Optional)
    *   Name or identifier of the article author/reviewer.
    *   Example: "NutriSnap Health Team"
*   **`isFeatured`**: (Boolean, Optional)
    *   Flag to indicate if the article should be highlighted as featured.
    *   Example: `false`
*   **`publicationDate`**: (Timestamp - Firestore `FieldValue.serverTimestamp()` or specific date)
    *   The date the article was published or last significantly updated.
*   **`createdAt`**: (Timestamp - Firestore `FieldValue.serverTimestamp()`)
    *   Timestamp of when the document was created.
*   **`updatedAt`**: (Timestamp - Firestore `FieldValue.serverTimestamp()`)
    *   Timestamp of when the document was last updated.

## 3. Example Firestore Documents

**Example: Short Article (`short_article_what_is_a_glucose_spike.md`)**

```json
{
  "title": "What is a Glucose Spike?",
  "slug": "what-is-a-glucose-spike",
  "content": "(Full Markdown content of the short article...)",
  "articleType": "short",
  "category": "Glucose 101",
  "tags": ["glucose", "sugar spike", "blood sugar", "energy"],
  "summary": "Learn what causes blood sugar spikes and their impact on your daily energy and long-term health.",
  "keyTakeaway": "Understanding and managing glucose spikes is a key aspect of metabolic health for everyone.",
  "publicationDate": "(Firestore Timestamp)",
  "createdAt": "(Firestore Timestamp)",
  "updatedAt": "(Firestore Timestamp)"
}
```

**Example: Long Article (`long_article_metabolic_health_beyond_diabetes.md`)**

```json
{
  "title": "Metabolic Health: Beyond Weight and Diabetes",
  "slug": "metabolic-health-beyond-diabetes",
  "content": "(Full Markdown content of the long article, including ToC markers if processed by frontend, and references section...)",
  "articleType": "long",
  "category": "Metabolic Health Essentials",
  "tags": ["metabolic health", "insulin resistance", "cgm", "lifestyle", "nutrition"],
  "summary": "An in-depth look at metabolic health, its core components, the role of glucose, and lifestyle strategies for optimization.",
  "estimatedReadTime": "12-15 minutes",
  "tableOfContents": true,
  "references": "(Markdown formatted references or link to section in content)",
  "publicationDate": "(Firestore Timestamp)",
  "createdAt": "(Firestore Timestamp)",
  "updatedAt": "(Firestore Timestamp)"
}
```

## 4. Considerations for Implementation

*   **Content Serving Strategy:** Your Firebase Functions will query this `knowledgeBaseArticles` collection. You need to decide if the functions will:
    *   Send the raw Markdown `content` to the Xcode frontend (frontend handles rendering).
    *   Parse the Markdown `content` into HTML or a structured JSON within the Firebase Function before sending it to the frontend (backend handles rendering logic).
*   **Indexing:** For efficient querying, especially by `category`, `articleType`, `slug`, and for sorting by `publicationDate`, configure appropriate indexes in Firestore.
*   **Search:** Firestore offers basic querying. For more advanced full-text search capabilities across the `content` field, you might consider integrating a third-party search service like Algolia or Typesense, which can be triggered by Firestore document changes via Firebase Functions.
*   **Initial Data Seeding:** A Node.js script can be written to parse the provided .md files, extract metadata (potentially from YAML front-matter you add to the files), and create these documents in Firestore.

This Firestore data model provides a flexible and scalable foundation for your NutriSnap app's knowledge base, supporting the features and content organization outlined in the `nutrisnap_knowledge_base_design.md`.
