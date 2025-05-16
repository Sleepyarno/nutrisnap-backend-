# NutriSnap Implementation Blueprint

This is the main implementation guide for building NutriSnap using Cursor or WindSurf AI assistance. Follow these steps in order to create a complete, functional application.

## Project Overview

NutriSnap is a mobile app that:
- Takes/uploads food pictures
- Analyzes and detects ingredients
- Provides macro and micronutrient information
- Predicts glucose spikes (premium feature)
- Processes payments for premium subscriptions

## Implementation Sequence

Follow these steps in order:

*Progress Tracker:*
- ✅ Project Setup
- ✅ Firebase Authentication
- ✅ Firebase Storage
- ✅ Food Detection Service
  - Implemented and deployed backend food analysis using Google Cloud Vision API (see [04_food_detection_service.md](04_food_detection_service.md)).
  - Functions `analyzefoodimage` and `getFoodScanResult` are live and documented.
  - Frontend and backend integration tested; results stored in Firestore.

- ✅ Database Implementation
  - Firestore schema fully designed and documented ([05_database_implementation.md](GUIDES/05_database_implementation.md)).
  - Security rules implemented and tested for user privacy and data integrity.
  - All scan-related backend logic (create, update, retrieve, history) implemented as Cloud Functions.
  - Comprehensive backend test suite (Jest + emulator) passing for all scan operations.
  - No frontend integration performed at this stage.

- ⬜ Premium Features
- ✅ Payment Processing
  - Payment webhook Cloud Function implemented and tested (handles success, renewal, cancel, refund, duplicate, and invalid events).
  - User premium status and subscription details reliably updated in Firestore.
  - All payment events recorded in Firestore payments collection.
  - Comprehensive backend test suite for all payment scenarios, running against the emulator.
  - No frontend payment integration at this stage.

- 🟡 Admin Tools (in progress)
  - Admin role support in user documents (role: 'admin' or 'user').
  - Admin-only endpoints implemented and tested:
    - listUsers: List all users (paginated)
    - listPayments: List all payments (paginated)
    - listScans: List all scans for any user (paginated)
  - Next up: setUserPremiumStatus (admin can change any user's premium status), getUsageStats (basic analytics)

- ✅ Notifications (complete)
  - Payment and scan result notifications fully implemented and tested
  - FCM utility and token registration robust
  - All critical user events now trigger notifications
- ⬜ Usage Analytics (not started)
  - Feature usage, aggregate stats
- ⬜ Audit Logging (not started)
  - Security/compliance logs
- ⬜ User Feedback (not started)
  - Feedback collection and admin notification
- ⬜ Data Export (not started)
  - User data export endpoint
- ⬜ Scan History Pagination/Search (not started)
  - API improvements for frontend UX
  
- ⬜ Frontend Integration (not started)
- ⬜ Testing & Deployment (not started)

1. ✅ [Project Setup](01_project_setup.md)
   - Initialize Firebase project
   - Set up development environment
   - Configure project structure

2. ✅ [Firebase Authentication](02_firebase_authentication.md)
   - Set up authentication services
   - Implement user registration and login
   - Create user profiles

3. ✅ [Firebase Storage](03_firebase_storage.md)
   - Configure storage rules
   - Implement image upload functionality
   - Set up secure access patterns

4. [Food Detection Service](04_food_detection_service.md)
   - Integrate Google Cloud Vision API
   - Implement food recognition functions
   - Create nutritional data processing

5. [Database Implementation](05_database_implementation.md)
   - Set up Firestore collections and documents
   - Implement data models
   - Configure security rules

6. [Premium Features](06_premium_features.md)
   - Implement glucose prediction algorithm
   - Create metabolic advice generation
   - Set up premium content access control

7. [Payment Processing](07_payment_processing.md)
   - Implement subscription verification
   - Set up platform-specific payment handling
   - Create transaction tracking

8. [Frontend Integration](08_frontend_integration.md)
   - Connect Lovable AI frontend to Firebase
   - Implement API service layer
   - Set up state management

9. [Testing & Deployment](09_testing_deployment.md)
   - Create test cases
   - Set up CI/CD pipeline
   - Configure production environment

## How to Use This Blueprint

1. Create a new project folder in Cursor or WindSurf
2. Copy each implementation file into your project
3. Follow the steps in order, completing each section before moving to the next
4. Use the AI assistant in Cursor or WindSurf to help implement each component
5. Test each component before proceeding to the next

## Code Style Guidelines

- Keep code clean and minimal
- Use modern JavaScript/TypeScript features
- Follow functional programming principles where possible
- Use async/await for asynchronous operations
- Include comments for complex logic only
- Use descriptive variable and function names

## Directory Structure

```
nutrisnap/
├── functions/              # Firebase Cloud Functions
│   ├── src/
│   │   ├── auth/           # Authentication functions
│   │   ├── food/           # Food detection functions
│   │   ├── premium/        # Premium feature functions
│   │   └── payments/       # Payment processing functions
│   ├── index.js            # Functions entry point
│   └── package.json        # Functions dependencies
├── firestore.rules         # Firestore security rules
├── storage.rules           # Storage security rules
├── firebase.json           # Firebase configuration
└── README.md               # Project documentation
```

## Implementation Notes

- Each implementation file contains detailed, step-by-step instructions
- Complex sections have their own dedicated files with detailed explanations
- Code snippets are provided for all key functionality
- Configuration values are clearly marked and explained
- Error handling patterns are included for all critical operations

Follow this blueprint sequentially to build a complete, production-ready NutriSnap application.
