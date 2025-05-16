# Firestore Rules Integration Guide

This guide explains how to integrate the Learn tab security rules into the main NutriSnap Firestore rules.

## Learn Tab Firestore Security Rules

The Learn tab requires specific security rules for its collections:
- `knowledgeBaseArticles` - Educational content
- `knowledgeBaseCategories` - (Optional) Category organization
- User-specific collections for bookmarks and read history

## Integration Steps

1. Open your main Firestore rules file (firestore.rules)
2. Add the following rules within the existing `match /databases/{database}/documents {` block:

```
// Learn Tab Collections
match /knowledgeBaseArticles/{articleId} {
  // Anyone can read articles (they're educational content)
  allow read: if true;
  
  // Only admins can create, update, or delete articles
  allow write: if request.auth != null && request.auth.token.admin == true;
}

// Rules for the optional knowledgeBaseCategories collection
match /knowledgeBaseCategories/{categoryId} {
  // Anyone can read categories
  allow read: if true;
  
  // Only admins can create, update, or delete categories
  allow write: if request.auth != null && request.auth.token.admin == true;
}
```

3. Add the following rules within the appropriate user section:

```
// Within the match /users/{userId} { ... } block:

// User's bookmarked Learn tab articles
match /bookmarkedArticles/{articleId} {
  // Users can only access their own bookmarked articles
  allow read, write: if request.auth != null && request.auth.uid == userId;
}

// User's read article history
match /readArticles/{articleId} {
  // Users can only access their own read history
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

4. If you plan to implement article feedback, add this at the root level:

```
// Optional rules for article feedback/ratings
match /articleFeedback/{feedbackId} {
  // Users can read all feedback
  allow read: if true;
  
  // Users can only create feedback if authenticated
  allow create: if request.auth != null;
  
  // Users can only update/delete their own feedback
  allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
}
```

5. Test and deploy your updated security rules:

```bash
# Test rules before deployment
firebase deploy --only firestore:rules --dry-run

# Deploy rules to the appropriate environment
firebase use dev # or test, prod
firebase deploy --only firestore:rules
```

## Security Considerations

- The rules above ensure that article content is publicly readable but only writeable by admins
- User-specific data (bookmarks, read history) is protected so users can only access their own data
- Consider adding additional validation rules if needed for your specific implementation

## Environment-Specific Rules

If you have environment-specific requirements, you can use the Firebase CLI to deploy different rule sets:

```bash
# Deploy rules to development
firebase use dev
firebase deploy --only firestore:rules -r dev

# Deploy rules to test
firebase use test
firebase deploy --only firestore:rules -r test

# Deploy rules to production
firebase use prod
firebase deploy --only firestore:rules -r prod
```
