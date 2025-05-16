// This script will reintroduce the isFoodItem helper function first, which is simpler
const fs = require('fs');
const path = require('path');

// Restore our simplified working version
const simplifiedBackupPath = path.join(__dirname, 'src/food/detection.js.simplified');
const workingPath = path.join(__dirname, 'src/food/detection.js');
fs.copyFileSync(simplifiedBackupPath, workingPath);
console.log('Restored simplified working version');

// Read the original file
const originalPath = path.join(__dirname, 'src/food/detection.js.original');
const originalContent = fs.readFileSync(originalPath, 'utf8');

// Extract the isFoodItem function which is a smaller, simpler function
const isFoodItemPattern = /function isFoodItem\(description\)[\s\S]*?return false;[\s\S]*?\}/g;
const match = originalContent.match(isFoodItemPattern);

if (!match) {
  console.error('Could not find isFoodItem function in the original file');
  process.exit(1);
}

// Get the current content of our working file
let workingContent = fs.readFileSync(workingPath, 'utf8');

// Insert the isFoodItem function before the exports
const exportPosition = workingContent.indexOf('// Export the handler function');
workingContent = workingContent.slice(0, exportPosition) + 
  '\n// Function to check if a label describes a food item\n' + match[0] + '\n\n' +
  workingContent.slice(exportPosition);

// Write the updated content
fs.writeFileSync(workingPath, workingContent);
console.log('Added isFoodItem function');

// Check for syntax errors
try {
  require('child_process').execSync(`node -c ${workingPath}`, {stdio: 'inherit'});
  console.log('No syntax errors detected after adding isFoodItem!');
} catch (e) {
  console.error('Syntax errors detected. The isFoodItem function might have issues.');
  process.exit(1);
}

// Now, let's extract the helper functions one by one
const helperFunctions = [
  { name: 'getNutritionFromOFF', pattern: /async function getNutritionFromOFF\(foodLabel\)[\s\S]*?return null;[\s\S]*?\}/g },
  { name: 'getNutritionFromUSDA', pattern: /async function getNutritionFromUSDA\(foodLabel\)[\s\S]*?return null;[\s\S]*?\}/g },
  { name: 'classifyMeal', pattern: /function classifyMeal\(ingredients, labels\)[\s\S]*?return classification;[\s\S]*?\}/g },
  { name: 'getReferenceNutritionData', pattern: /function getReferenceNutritionData\(detectedIngredients, labels\)[\s\S]*?return null;[\s\S]*?\}/g },
  { name: 'calculateNutritionFromIngredients', pattern: /function calculateNutritionFromIngredients\(detectedIngredients, labels\)[\s\S]*?return [\s\S]*?\};[\s\S]*?\}/g },
  { name: 'getNutritionData', pattern: /async function getNutritionData\(foodItems\)[\s\S]*?return [\s\S]*?\};[\s\S]*?\}/g }
];

// Now let's try adding each helper function one at a time
for (const func of helperFunctions) {
  const match = originalContent.match(func.pattern);
  
  if (!match) {
    console.error(`Could not find ${func.name} function in the original file`);
    continue;
  }
  
  // Read the current working file content again
  workingContent = fs.readFileSync(workingPath, 'utf8');
  
  // Insert the function before the exports
  const exportPosition = workingContent.indexOf('// Export the handler function');
  workingContent = workingContent.slice(0, exportPosition) + 
    `\n// ${func.name} function\n` + match[0] + '\n\n' +
    workingContent.slice(exportPosition);
  
  // Write the updated content
  fs.writeFileSync(workingPath, workingContent);
  console.log(`Added ${func.name} function`);
  
  // Check for syntax errors
  try {
    require('child_process').execSync(`node -c ${workingPath}`, {stdio: 'inherit'});
    console.log(`No syntax errors detected after adding ${func.name}!`);
  } catch (e) {
    console.error(`Syntax errors detected. The ${func.name} function has issues.`);
    console.error(e.message);
    
    // Revert the change by restoring the last working version
    const lastWorkingVersion = fs.readFileSync(`${workingPath}.last_working`, 'utf8');
    fs.writeFileSync(workingPath, lastWorkingVersion);
    console.log(`Reverted to last working version without ${func.name}`);
    break;
  }
  
  // If it worked, save this as the last working version
  fs.copyFileSync(workingPath, `${workingPath}.last_working`);
}

console.log('Finished adding all compatible helper functions');
