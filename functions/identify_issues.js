// This script will create simpler versions of the original file to identify issues
const fs = require('fs');
const path = require('path');

// Create a directory to hold our test versions
const testDir = path.join(__dirname, 'test_versions');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

// Paths to our files
const originalPath = path.join(__dirname, 'src/food/detection.js.original');
const currentPath = path.join(__dirname, 'src/food/detection.js');

// Backup current simplified working version
fs.copyFileSync(currentPath, path.join(__dirname, 'src/food/detection.js.working'));
console.log('Backed up current working version');

// Read the original content
const originalContent = fs.readFileSync(originalPath, 'utf8');

// First, check the structure of the file
const openBraces = (originalContent.match(/\{/g) || []).length;
const closeBraces = (originalContent.match(/\}/g) || []).length;
console.log(`Original file has ${openBraces} opening braces and ${closeBraces} closing braces`);

if (openBraces !== closeBraces) {
  console.log('ISSUE FOUND: Unbalanced braces in the original file!');
}

// Identify each function in the file
const functionMatches = [...originalContent.matchAll(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(\)|\()/g)];
console.log('Functions found in the file:');
functionMatches.forEach((match, index) => {
  console.log(`${index + 1}. ${match[1] || 'anonymous function'} at position ${match.index}`);
});

// Look for potential syntax issues in each section
console.log('\nAnalyzing sections for syntax issues...');

// Section 1: Check the Cloud Run server section at the end
const serverSetupSection = originalContent.substring(originalContent.indexOf('// Start server if this file is run directly'));
console.log('\nChecking server setup section:');

// See if there's a try without catch
const tryCount = (serverSetupSection.match(/try\s*\{/g) || []).length;
const catchCount = (serverSetupSection.match(/catch\s*\(/g) || []).length;
console.log(`- Server section has ${tryCount} try blocks and ${catchCount} catch blocks`);

if (tryCount !== catchCount) {
  console.log('ISSUE FOUND: Unbalanced try/catch in server section!');
}

// Section 2: Check the Firebase functions exports
const exportsSection = originalContent.substring(originalContent.indexOf('// Export the handler function'));
console.log('\nChecking exports section:');

// Check if the exports are properly formed
const exportLines = exportsSection.split('\n').filter(line => line.includes('exports.'));
exportLines.forEach(line => {
  console.log(`- ${line.trim()}`);
  if (!line.includes(';') && !line.includes('=')) {
    console.log('ISSUE FOUND: Malformed export line!');
  }
});

// Section 3: Create a version without the server code
console.log('\nCreating version without server code...');
const beforeServerCode = originalContent.substring(0, originalContent.indexOf('// Start server if this file is run directly'));
fs.writeFileSync(path.join(testDir, 'no_server_code.js'), beforeServerCode);

// Test the syntax
try {
  require('child_process').execSync(`node -c ${path.join(testDir, 'no_server_code.js')}`, 
    { stdio: 'pipe' });
  console.log('✅ No syntax errors without server code!');
} catch (e) {
  console.log('❌ Syntax errors without server code:', e.message);
}

// Section 4: Create a version with just the exports and basic structure
console.log('\nCreating minimal version with just exports...');
const imports = originalContent.substring(0, originalContent.indexOf('let visionClient = null;') + 'let visionClient = null;'.length);
const exportsPart = originalContent.substring(originalContent.indexOf('exports.analyzeFoodImageHandler'), 
  originalContent.indexOf('// Get food scan result') + 5000);

const minimalExports = `${imports}

// Minimal function implementation 
async function analyzeFoodImageHandler(request) {
  const { data, auth } = request;
  if (!auth) {
    throw new Error('Not authenticated');
  }
  return { success: true };
}

${exportsPart}`;

fs.writeFileSync(path.join(testDir, 'minimal_exports.js'), minimalExports);

// Test the syntax
try {
  require('child_process').execSync(`node -c ${path.join(testDir, 'minimal_exports.js')}`, 
    { stdio: 'pipe' });
  console.log('✅ No syntax errors with minimal exports!');
} catch (e) {
  console.log('❌ Syntax errors with minimal exports:', e.message);
}

// Section 5: Create versions with individual pieces of the main handler
console.log('\nAnalyzing the analyzeFoodImageHandler function...');

// Extract just that function
const handlerStart = originalContent.indexOf('async function analyzeFoodImageHandler(request)');
let handlerEnd = originalContent.indexOf('exports.analyzeFoodImageHandler');
if (handlerEnd === -1) {
  handlerEnd = originalContent.length;
}

const handlerCode = originalContent.substring(handlerStart, handlerEnd);
console.log(`- Handler function is ${handlerCode.split('\n').length} lines long`);

// Count braces in just this function
const handlerOpenBraces = (handlerCode.match(/\{/g) || []).length;
const handlerCloseBraces = (handlerCode.match(/\}/g) || []).length;
console.log(`- Handler has ${handlerOpenBraces} opening braces and ${handlerCloseBraces} closing braces`);

if (handlerOpenBraces !== handlerCloseBraces) {
  console.log('ISSUE FOUND: Unbalanced braces in handler function!');
}

// Check for try/catch balance
const handlerTryCount = (handlerCode.match(/try\s*\{/g) || []).length;
const handlerCatchCount = (handlerCode.match(/catch\s*\(/g) || []).length;
console.log(`- Handler has ${handlerTryCount} try blocks and ${handlerCatchCount} catch blocks`);

if (handlerTryCount !== handlerCatchCount) {
  console.log('ISSUE FOUND: Unbalanced try/catch in handler function!');
}

// Now check for nested function definition issues
const nestedFunctions = [...handlerCode.matchAll(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(\)|\()/g)];
if (nestedFunctions.length > 0) {
  console.log('- Handler contains nested function definitions:');
  nestedFunctions.forEach((match, index) => {
    console.log(`  ${index + 1}. ${match[1] || 'anonymous'} at position ${match.index}`);
  });
  console.log('POTENTIAL ISSUE: Nested function definitions may cause scope problems');
}

console.log('\nAnalysis complete!');
