/**
 * Deploy script focused on just the learn_getFeaturedArticles function
 * Bypasses any syntax issues in unrelated files
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to the temporary directory for deployment
const tempDirPath = path.join(__dirname, 'temp-deploy');

// Create temp directory
if (!fs.existsSync(tempDirPath)) {
  fs.mkdirSync(tempDirPath);
  fs.mkdirSync(path.join(tempDirPath, 'src'));
}

console.log('Creating temporary deployment directory...');

// Copy package.json
fs.copyFileSync(
  path.join(__dirname, 'functions', 'package.json'),
  path.join(tempDirPath, 'package.json')
);

// Copy optimized index file
fs.copyFileSync(
  path.join(__dirname, 'functions', 'src', 'learn-optimized-index.js'),
  path.join(tempDirPath, 'src', 'learn-optimized-index.js')
);

// Create minimal index.js
const indexContent = `
const admin = require('firebase-admin');
admin.initializeApp();

// Import field-corrected version of featured articles function
const learnFeatured = require('./src/learn-optimized-index');

// Export only the fixed featured articles function
exports.learn_getFeaturedArticles = learnFeatured.getFeaturedArticles;
`;

fs.writeFileSync(path.join(tempDirPath, 'index.js'), indexContent);

console.log('Files prepared, deploying learn_getFeaturedArticles function...');

try {
  // Change to the temp directory
  process.chdir(tempDirPath);
  
  // Install dependencies
  execSync('npm install firebase-admin firebase-functions', { stdio: 'inherit' });
  
  // Deploy only the learn_getFeaturedArticles function
  execSync('firebase deploy --only functions:learn_getFeaturedArticles --project=nutrisnap2', 
    { stdio: 'inherit' });
    
  console.log('Deployment successful!');
} catch (error) {
  console.error('Deployment failed:', error);
} finally {
  // Clean up temporary directory
  process.chdir(__dirname);
  if (fs.existsSync(tempDirPath)) {
    fs.rmSync(tempDirPath, { recursive: true, force: true });
  }
  console.log('Temporary files cleaned up');
}
