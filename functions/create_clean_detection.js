const fs = require('fs');
const path = require('path');

// Path to the original and new files
const originalPath = path.join(__dirname, 'src/food/detection.js');
const tempPath = path.join(__dirname, 'src/food/detection.js.original');
const newPath = path.join(__dirname, 'src/food/detection.js');

// Back up the original file
fs.copyFileSync(originalPath, tempPath);
console.log(`Original file backed up to ${tempPath}`);

// Read the content of the original file
const originalContent = fs.readFileSync(originalPath, 'utf8');

// Extract the essential function implementations while fixing the variable declarations
// Keep the essential functions: analyzeFoodImageHandler, getFoodScanResult, and their helpers
const extractFunctionPattern = /async function analyzeFoodImageHandler\(request\) \{[\s\S]*?exports\.analyzeFoodImage = onCall\(\s*\{\s*enforceAppCheck:\s*true,\s*memory:\s*"512MiB"\s*\},\s*analyzeFoodImageHandler\s*\);/g;
const functionMatch = originalContent.match(extractFunctionPattern);

if (!functionMatch) {
  console.error('Could not find the analyzeFoodImageHandler function in the file.');
  process.exit(1);
}

// Extract the getFoodScanResult function implementation
const extractGetFoodScanPattern = /exports\.getFoodScanResult = onCall\([\s\S]*?async \(data, context\) => \{[\s\S]*?return scanResult;[\s\S]*?\}\s*\);/g;
const getFoodScanMatch = originalContent.match(extractGetFoodScanPattern);

if (!getFoodScanMatch) {
  console.error('Could not find the getFoodScanResult function in the file.');
  // Continue anyway
}

// Extract helper functions needed by the main functions
const helperFunctions = [
  'isFoodItem',
  'getNutritionFromOFF',
  'getNutritionFromUSDA',
  'classifyMeal',
  'getReferenceNutritionData',
  'calculateNutritionFromIngredients',
  'getNutritionData'
];

const helperFunctionPatterns = helperFunctions.map(fnName => {
  const pattern = new RegExp(`(function\\s+${fnName}|const\\s+${fnName}\\s*=\\s*|${fnName}\\s*=\\s*function)\\s*\\([^\\)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'g');
  const match = originalContent.match(pattern);
  return match ? match[0] : null;
}).filter(Boolean);

// Extract the imports and initialization
const importPattern = /\/\* eslint-env node \*\/[\s\S]*?let visionClient = null;/g;
const importMatch = originalContent.match(importPattern);

if (!importMatch) {
  console.error('Could not find the import section in the file.');
  process.exit(1);
}

// Create a new file with clean structure
const newContent = `${importMatch[0]}

// Helper functions
${helperFunctionPatterns.join('\n\n')}

// Main function
${functionMatch[0]}

// Get food scan result function
${getFoodScanMatch ? getFoodScanMatch[0] : '// getFoodScanResult function not found'}

// End of file`;

// Write the new content to the file
fs.writeFileSync(newPath, newContent);
console.log(`Clean version of detection.js has been created at ${newPath}`);

// Test the syntax of the new file
try {
  require('child_process').execSync(`node --check ${newPath}`, {stdio: 'inherit'});
  console.log('Syntax check passed!');
} catch (e) {
  console.error('Syntax check failed:', e.message);
}
