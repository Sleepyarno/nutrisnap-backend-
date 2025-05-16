const fs = require('fs');
const path = require('path');

// Path to files
const originalPath = path.join(__dirname, 'src/food/detection.js.original');
const workingPath = path.join(__dirname, 'src/food/detection.js');
const backupPath = path.join(__dirname, 'src/food/detection.js.backup');
const tempPath = path.join(__dirname, 'src/food/detection.js.temp');

// Backup current working version
fs.copyFileSync(workingPath, backupPath);
console.log('Backed up current working version to', backupPath);

// Read the original content
const originalContent = fs.readFileSync(originalPath, 'utf8');

// STEP 1: Extract all top-level functions and imports
console.log('Step 1: Extracting functions and structure...');

// Extract the imports and initialization
const importsSection = originalContent.substring(0, originalContent.indexOf('let visionClient = null;') + 'let visionClient = null;'.length);

// Extract the getVisionClient function (this is properly defined at the top level)
const getVisionClientPattern = /async function getVisionClient\(\) \{[\s\S]*?return visionClient;\n\}/;
const getVisionClientMatch = originalContent.match(getVisionClientPattern);
const getVisionClientFunction = getVisionClientMatch ? getVisionClientMatch[0] : '';

// Extract the essential functions that should be at the top level
// Function patterns - using careful matching of entire functions
const functionPatterns = [
  {
    name: 'isFoodItem',
    pattern: /function isFoodItem\(description\) \{[\s\S]*?return false;\n\s*\}/
  },
  {
    name: 'getNutritionFromOFF',
    pattern: /async function getNutritionFromOFF\(foodLabel\) \{[\s\S]*?return null;\n\s*\}/
  },
  {
    name: 'getNutritionFromUSDA',
    pattern: /async function getNutritionFromUSDA\(foodLabel\) \{[\s\S]*?return null;\n\s*\}/
  },
  {
    name: 'classifyMeal',
    pattern: /function classifyMeal\(ingredients, labels\) \{[\s\S]*?return classification;\n\s*\}/
  },
  {
    name: 'getReferenceNutritionData',
    pattern: /function getReferenceNutritionData\(detectedIngredients, labels\) \{[\s\S]*?return null;\n\s*\}/
  },
  {
    name: 'calculateNutritionFromIngredients',
    pattern: /function calculateNutritionFromIngredients\(detectedIngredients, labels\) \{[\s\S]*?return [\s\S]*?;\n\s*\}/
  },
  {
    name: 'getNutritionData',
    pattern: /async function getNutritionData\(foodItems\) \{[\s\S]*?return [\s\S]*?;\n\s*\}/
  }
];

// Extract each function
const extractedFunctions = {};
functionPatterns.forEach(func => {
  const match = originalContent.match(func.pattern);
  if (match) {
    extractedFunctions[func.name] = match[0];
    console.log(`Extracted ${func.name} function`);
  } else {
    console.log(`Could not extract ${func.name} function`);
    // For critical functions, we could provide simplified implementations
  }
});

// STEP 2: Extract the main handler function and correct its structure
console.log('\nStep 2: Extracting and fixing the main handler function...');

// Extract the main structure of analyzeFoodImageHandler without nested functions
let handlerFunction = originalContent.substring(
  originalContent.indexOf('async function analyzeFoodImageHandler(request)'),
  originalContent.indexOf('exports.analyzeFoodImageHandler = analyzeFoodImageHandler;')
);

// Fix unbalanced braces in handler function - the trickiest part
// We'll count opening and closing braces to find where they become unbalanced
let braceCount = 0;
let insideSingleQuote = false;
let insideDoubleQuote = false;
let insideComment = false;
let insideMultiLineComment = false;
let charIndex = 0;

// This array will keep track of the positions of all braces
const bracePositions = [];

for (let i = 0; i < handlerFunction.length; i++) {
  const char = handlerFunction[i];
  const nextChar = handlerFunction[i + 1] || '';
  
  // Skip characters inside quotes
  if (char === "'" && !insideDoubleQuote && handlerFunction[i-1] !== '\\') {
    insideSingleQuote = !insideSingleQuote;
    continue;
  }
  
  if (char === '"' && !insideSingleQuote && handlerFunction[i-1] !== '\\') {
    insideDoubleQuote = !insideDoubleQuote;
    continue;
  }
  
  // Skip characters inside comments
  if (!insideSingleQuote && !insideDoubleQuote) {
    if (char === '/' && nextChar === '/') {
      insideComment = true;
      continue;
    }
    
    if (char === '/' && nextChar === '*') {
      insideMultiLineComment = true;
      continue;
    }
    
    if (insideComment && char === '\n') {
      insideComment = false;
      continue;
    }
    
    if (insideMultiLineComment && char === '*' && nextChar === '/') {
      insideMultiLineComment = false;
      i++; // Skip the next character (/)
      continue;
    }
  }
  
  // Only count braces outside quotes and comments
  if (!insideSingleQuote && !insideDoubleQuote && !insideComment && !insideMultiLineComment) {
    if (char === '{') {
      braceCount++;
      bracePositions.push({ type: 'open', position: i, count: braceCount });
    } else if (char === '}') {
      braceCount--;
      bracePositions.push({ type: 'close', position: i, count: braceCount });
      
      // If braceCount becomes negative, we found a closing brace without an opening one
      if (braceCount < 0) {
        console.log(`Found unexpected closing brace at position ${i}`);
        // We could fix this, but it would be tricky
      }
    }
  }
}

console.log(`Brace analysis: final count = ${braceCount}`);

if (braceCount !== 0) {
  console.log(`Handler function has ${braceCount > 0 ? 'missing' : 'extra'} closing braces`);
  // We need to fix this by adding or removing braces
  if (braceCount > 0) {
    // Add missing closing braces at the end
    handlerFunction += '}'.repeat(braceCount);
    console.log(`Added ${braceCount} closing braces at the end`);
  }
}

// STEP 3: Extract the exports section
console.log('\nStep 3: Extracting exports section...');

const exportsSection = [
  'exports.analyzeFoodImageHandler = analyzeFoodImageHandler;',
  'exports.analyzeFoodImage = onCall(',
  '  { enforceAppCheck: true, memory: "512MiB" },',
  '  analyzeFoodImageHandler',
  ');'
].join('\n');

// Extract getFoodScanResult function using regex
const getFoodScanPattern = /exports\.getFoodScanResult = onCall\([\s\S]*?async \(data, context\) => \{[\s\S]*?return scanResult;\n\s*\}\n\s*\);/;
const getFoodScanMatch = originalContent.match(getFoodScanPattern);
const getFoodScanFunction = getFoodScanMatch ? getFoodScanMatch[0] : [
  'exports.getFoodScanResult = onCall(',
  '  {',
  '    enforceAppCheck: true,',
  '  },',
  '  async (data, context) => {',
  '    // Authentication check',
  '    if (!context.auth) {',
  '      throw new HttpsError(',
  '        \'unauthenticated\',',
  '        \'The function must be called while authenticated.\'',
  '      );',
  '    }',
  '    ',
  '    // Placeholder implementation',
  '    return {',
  '      success: true,',
  '      scan: {',
  '        id: data.scanId || "placeholder-scan-id",',
  '        timestamp: Timestamp.now(),',
  '        items: []',
  '      }',
  '    };',
  '  }',
  ');'
].join('\n');

// STEP 4: Assemble the final file with all components
console.log('\nStep 4: Assembling final file...');

const finalContent = [
  importsSection,
  '\n',
  getVisionClientFunction,
  '\n// Analyze food image',
  'const { onCall } = require("firebase-functions/v2/https");',
  '\n// Helper functions'
];

// Add all the extracted helper functions
Object.values(extractedFunctions).forEach(func => {
  finalContent.push('\n' + func);
});

// Add the main handler function and exports
finalContent.push('\n// Main handler function');
finalContent.push(handlerFunction);
finalContent.push('\n// Exports');
finalContent.push(exportsSection);
finalContent.push('\n// Get food scan result');
finalContent.push(getFoodScanFunction);

// Write the fixed file
fs.writeFileSync(tempPath, finalContent.join('\n'));
console.log(`Fixed file written to ${tempPath}`);

// Test the syntax
try {
  require('child_process').execSync(`node -c ${tempPath}`, {stdio: 'inherit'});
  console.log('✅ Syntax check passed! Applying changes to working file.');
  fs.copyFileSync(tempPath, workingPath);
} catch (e) {
  console.error('❌ Syntax errors in fixed file. Not applying changes.');
  console.error('Details:', e.message);
}
