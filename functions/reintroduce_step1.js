// This script will reintroduce the analyzeFoodImageHandler function with its original implementation
const fs = require('fs');
const path = require('path');

// Get the current simplified file and backup it
const simplifiedPath = path.join(__dirname, 'src/food/detection.js');
const backupPath = path.join(__dirname, 'src/food/detection.js.simplified');
fs.copyFileSync(simplifiedPath, backupPath);
console.log(`Current working file backed up to ${backupPath}`);

// Read the simplified and original files
const simplifiedContent = fs.readFileSync(simplifiedPath, 'utf8');
const originalPath = path.join(__dirname, 'src/food/detection.js.original');
const originalContent = fs.readFileSync(originalPath, 'utf8');

// Extract the original analyzeFoodImageHandler function
// We'll search from the function definition to the exports declaration
const analyzeFoodImageHandlerPattern = /async function analyzeFoodImageHandler\(request\)[\s\S]*?exports\.analyzeFoodImageHandler = analyzeFoodImageHandler;/g;
const match = originalContent.match(analyzeFoodImageHandlerPattern);

if (!match) {
  console.error('Could not find analyzeFoodImageHandler in the original file');
  process.exit(1);
}

const originalHandler = match[0];

// Replace the simplified handler in our working copy
const simplifiedHandlerPattern = /async function analyzeFoodImageHandler\(request\)[\s\S]*?exports\.analyzeFoodImageHandler = analyzeFoodImageHandler;/g;
const updatedContent = simplifiedContent.replace(simplifiedHandlerPattern, originalHandler);

// Write the updated content
fs.writeFileSync(simplifiedPath, updatedContent);
console.log('Reintroduced the original analyzeFoodImageHandler function');

// Check for syntax errors
try {
  require('child_process').execSync(`node -c ${simplifiedPath}`, {stdio: 'inherit'});
  console.log('No syntax errors detected!');
} catch (e) {
  console.error('Syntax errors detected. This is the problematic section.');
}
