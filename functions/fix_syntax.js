const fs = require('fs');
const path = require('path');

// Read the detection.js file
const filePath = path.join(__dirname, 'src/food/detection.js');
let content = fs.readFileSync(filePath, 'utf8');

// Make a backup of the original file
fs.writeFileSync(filePath + '.bak', content);
console.log('Created backup of original file');

// Check if the file ends with double braces added by our previous fix
if (content.endsWith('}}')) {
  // Remove the last two characters (the extra closing braces)
  content = content.slice(0, -2);
  console.log('Removed extra closing braces from the end');
}

// This time let's try to isolate the section with the try/catch issue
const lines = content.split('\n');
let inComplexBlock = false;
let tryBlocksStack = [];
let tryBlockLines = [];

lines.forEach((line, index) => {
  // Match try blocks
  if (line.includes('try {') || line.includes('try{')) {
    tryBlocksStack.push(index + 1);
    tryBlockLines.push(index + 1);
  }
  
  // Match catch blocks
  if (line.includes('catch') && line.includes('{')) {
    if (tryBlocksStack.length > 0) {
      tryBlocksStack.pop();
    }
  }
});

console.log('Potentially unclosed try blocks at lines:', tryBlockLines);
console.log('Still unclosed after matching catch blocks:', tryBlocksStack);

// Let's fix the issue by checking the if-require-main section at the end
let serverSetupSection = content.substring(content.indexOf('// Start server if this file is run directly'));

// Check if the server setup section has a complete try/catch
if (serverSetupSection.includes('try {') && !serverSetupSection.includes('catch (error)')) {
  console.log('Found incomplete try/catch in server setup section');
  // Add the missing catch block before the last closing brace
  const lastBraceIndex = content.lastIndexOf('}');
  const fixedContent = content.slice(0, lastBraceIndex) + 
    '\n  } catch (error) {\n    console.error(\'Error in server startup:\', error);\n  ' + 
    content.slice(lastBraceIndex);
  
  content = fixedContent;
  console.log('Added missing catch block to fix try/catch structure');
}

// Check if we have any try blocks without catch at the end of the file
if (tryBlocksStack.length > 0) {
  console.log(`${tryBlocksStack.length} unclosed try blocks found`);
  const lastTryLine = tryBlocksStack[tryBlocksStack.length - 1];
  console.log(`Last unclosed try block is at line ${lastTryLine}`);
  
  // Clean up the file structure
  const lines = content.split('\n');
  for (let i = 0; i < tryBlocksStack.length; i++) {
    lines.push('} catch (error) { console.error("Error", error); }');
  }
  content = lines.join('\n');
  console.log(`Added ${tryBlocksStack.length} missing catch blocks`);
}

// Write the fixed content back to the file
fs.writeFileSync(filePath, content);
console.log('Fixed file saved');

// Check the file for syntax errors
try {
  require(filePath);
  console.log('No syntax errors detected after fixes');
} catch (e) {
  console.error('Syntax errors remain:', e.message);
}
