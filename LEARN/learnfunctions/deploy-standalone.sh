#!/bin/bash
# Deploy the standalone learn_getFeaturedArticles function

# Set the project
PROJECT_ID="nutrisnap2"

# Set up environment
cd "$(dirname "$0")"
FUNCTIONS_DIR="$(cd ../../functions && pwd)"

echo "Preparing to deploy standalone featured articles function..."

# Create a temporary directory for deployment
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Copy package.json and minimal dependencies
cp $FUNCTIONS_DIR/package.json $TEMP_DIR/
mkdir -p $TEMP_DIR/src

# Copy our standalone function
cp standalone-featured-articles.js $TEMP_DIR/src/

# Create a minimal index.js that only exports the learn function
cat > $TEMP_DIR/index.js << 'EOF'
const admin = require('firebase-admin');
admin.initializeApp();

const learnFunctions = require('./src/standalone-featured-articles');

// Export only the featured articles function with the expected name
exports.learn_getFeaturedArticles = learnFunctions.getFeaturedArticles;
EOF

echo "Files prepared for deployment..."

# Change to temp directory and deploy
cd $TEMP_DIR
echo "Deploying learn_getFeaturedArticles function..."
firebase deploy --only functions:learn_getFeaturedArticles --project=$PROJECT_ID

# Cleanup
cd -
rm -rf $TEMP_DIR
echo "Deployment complete and temporary files cleaned up"
