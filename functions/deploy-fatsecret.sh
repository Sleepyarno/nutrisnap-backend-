#!/bin/bash
# Standalone deployment script for FatSecret OAuth 2.0 functions
# Created: May 12, 2025

# Set colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}====== NutriSnap FatSecret Functions Deployment ======${NC}"

# Check if environment variables are set for FatSecret API
if [ -z "$FATSECRET_CLIENT_ID" ] || [ -z "$FATSECRET_CLIENT_SECRET" ]; then
  echo -e "${YELLOW}Warning: FatSecret API credentials not found in environment${NC}"
  echo "Loading from .env file if available..."
  # Try to load from .env file
  if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo -e "${GREEN}Loaded credentials from .env file${NC}"
  else
    echo -e "${RED}Error: No FatSecret credentials found${NC}"
    echo "Please set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET environment variables"
    echo "or create a .env file with these values."
    exit 1
  fi
fi

# Test FatSecret API connectivity
echo -e "${YELLOW}Testing FatSecret API connectivity...${NC}"

# Create a temporary test script
cat > ./test-token.js << 'EOF'
const fetch = require('node-fetch');

async function testConnection() {
  try {
    // Test if we can get a token from FatSecret
    const clientId = process.env.FATSECRET_CLIENT_ID;
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('FatSecret credentials not available');
    }

    // Request token
    const tokenResponse = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'basic',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get FatSecret token: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('API Connection Test Successful!');
    console.log(`Token expires in: ${tokenData.expires_in} seconds`);
    return true;
  } catch (error) {
    console.error('API Connection Test Failed:', error);
    return false;
  }
}

testConnection().then(success => process.exit(success ? 0 : 1));
EOF

# Run the test script
node ./test-token.js

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: FatSecret API connection test failed${NC}"
  echo "Please check your API credentials and try again."
  rm ./test-token.js
  exit 1
fi

# Clean up temporary file
rm ./test-token.js

echo -e "${GREEN}API Connection Test Successful!${NC}"
echo -e "${YELLOW}Deploying FatSecret standalone functions...${NC}"

# Get the Firebase project ID
echo -e "${YELLOW}Which Firebase project would you like to deploy to?${NC}"
echo "Available projects:"
firebase projects:list
echo ""
echo -e "${YELLOW}Enter the project ID (e.g. nutrisnap2):${NC} "
read PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: No project ID provided${NC}"
  exit 1
fi

# Deploy using the custom config file to bypass the detection.js issue
firebase deploy --only functions:searchFatSecretNutrition,functions:getFatSecretFoodDetails,functions:getAutocompleteSuggestions --config firebase-fatsecret.json --project $PROJECT_ID

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Deployment failed${NC}"
  exit 1
fi

echo -e "${GREEN}====== Deployment Successful! ======${NC}"
echo ""
echo "Your FatSecret functions are now available:"
echo "- searchFatSecretNutrition"
echo "- getFatSecretFoodDetails"
echo "- getAutocompleteSuggestions"
echo ""
echo -e "${YELLOW}Note: These functions are deployed independently from the rest of your application.${NC}"
echo "Make sure to update the main codebase to use these functions when you fix the detection.js issues."
