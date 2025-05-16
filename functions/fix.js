// This script will fix the syntax errors in detection.js
const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(__dirname, 'src/food/detection.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the trailing comma in return object
content = content.replace(/nutrition: mergedResult,(\s+)\};/g, 'nutrition: mergedResult$1};');

// Fix multiple nutrition values if present
content = content.replace(/nutrition: mergedResult,(\s+)nutrition: nutritionResult,/g, 'nutrition: mergedResult');

// Fix the orphaned try block by removing it
content = content.replace(/\/\/ Process the image and return results\s+try {/g, '// Process the image and return results');

// Write the fixed content back
fs.writeFileSync(filePath, content);

console.log('Fixes applied to detection.js');
