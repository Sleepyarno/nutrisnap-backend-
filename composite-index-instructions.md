# Learn Tab Fix: Create Required Firestore Index

The error in your Learn tab is because Firestore needs a composite index for queries that filter by `featured` AND sort by `publicationDate`.

## Quick Fix Instructions

1. **Open this URL** in your browser:

```
https://console.firebase.google.com/v1/r/project/nutrisnap2/firestore/indexes?create_composite=Clhwcm9qZWN0cy9udXRyaXNuYXAyL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9rbm93bGVkZ2VCYXNlQXJ0aWNsZXMvaW5kZXhlcy9fEAEaDAoIZmVhdHVyZWQQARoTCg9wdWJsaWNhdGlvbkRhdGUQAhoMCghfX25hbWVfXxAC
```

2. This will open the Firebase console and automatically fill in the index creation form. **Click "Create Index"**

3. **Wait** for the index to build (usually takes 1-2 minutes)

4. **Reload** your app to test the Learn tab

## What This Does

This creates a composite index on the `knowledgeBaseArticles` collection with:
- Field 1: `featured` (Ascending)
- Field 2: `publicationDate` (Descending)

Which allows your Learn tab to efficiently query for featured articles sorted by date.

No code changes needed - just create the index!
