const fs = require('fs');
const path = require('path');

console.log('Starting comprehensive fix for detection.js...');

// Create backup
const filePath = path.join(__dirname, 'src/food/detection.js');
const backupPath = path.join(__dirname, 'src/food/detection.js.backup');
fs.copyFileSync(filePath, backupPath);
console.log('Created backup at', backupPath);

// Read content
let content = fs.readFileSync(filePath, 'utf8');
console.log('Read file content');

// First, fix any variable redeclaration issues
content = content.replace(
  /const\s+filteredFoodLabels\s+=\s+foodLabels/g, 
  'let filteredFoodLabels = foodLabels'
);
console.log('Fixed variable declarations');

// Fix the "if (require.main === module)" section that has syntax errors
const serverStartupPattern = /\/\/ Start server if this file is run directly[\s\S]*?if \(require\.main === module\) \{[\s\S]*$/;
const serverMatch = content.match(serverStartupPattern);

if (serverMatch) {
  // Remove the entire server startup section - it's not needed for Firebase Functions
  console.log('Found server startup section, removing it as it is not used in Firebase Functions');
  content = content.replace(serverStartupPattern, 
    '// Start server code removed - not used in Firebase Functions deployment\n');
}

// Make sure the Firebase Functions exports are correctly structured
// Check if the functions are exported with v2 syntax
let hasV2Exports = content.includes('exports.analyzeFoodImage = onCall(');

if (!hasV2Exports) {
  console.log('Updating to Firebase Functions v2 syntax');
  content = content.replace(
    /exports\.analyzeFoodImage\s*=\s*functions\.https\.onCall/g,
    'exports.analyzeFoodImage = onCall'
  );
}

// Make sure all try blocks have corresponding catch blocks
// This is a simplistic approach, but might help with basic issues
let tryCount = (content.match(/try\s*\{/g) || []).length;
let catchCount = (content.match(/catch\s*\(/g) || []).length;

console.log(`Found ${tryCount} try blocks and ${catchCount} catch blocks`);

// Write the fixed content back to the file
fs.writeFileSync(filePath, content);
console.log('Saved fixed content');

// Test the syntax
try {
  console.log('Testing file syntax...');
  require('child_process').execSync(`node --check ${filePath} 2>&1 || echo "Syntax error detected"`, 
    { stdio: 'inherit' });
} catch (error) {
  console.error('Syntax validation failed:', error.message);
}
