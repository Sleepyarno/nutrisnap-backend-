const fs = require('fs');
const path = require('path');

// Read the detection.js file
const filePath = path.join(__dirname, 'src/food/detection.js');
const content = fs.readFileSync(filePath, 'utf8');

// Split into lines for analysis
const lines = content.split('\n');
const fixedLines = [...lines];
let tryOpenCount = 0;
let catchCloseCount = 0;

// Count try and catch blocks
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.match(/try\s*\{/)) {
    tryOpenCount++;
  }
  
  if (line.match(/catch\s*\([^)]*\)\s*\{/)) {
    catchCloseCount++;
  }
}

console.log(`Found ${tryOpenCount} try blocks and ${catchCloseCount} catch blocks`);

// Very specific approach - check the end of the file for the server setup section
const serverSection = lines.slice(-50).join('\n');
if (serverSection.includes('if (require.main === module)')) {
  console.log('Found server setup section at the end of the file');
  
  // Check if there's an unclosed try block in the server section
  let bracketCount = 0;
  let inTryBlock = false;
  let tryStartLine = -1;
  
  for (let i = lines.length - 50; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.match(/try\s*\{/)) {
      inTryBlock = true;
      tryStartLine = i;
      bracketCount++;
    }
    
    if (line.includes('{')) {
      bracketCount++;
    }
    
    if (line.includes('}')) {
      bracketCount--;
      if (bracketCount === 0 && inTryBlock) {
        // Check if the next line has a catch block
        if (i + 1 < lines.length && !lines[i+1].includes('catch')) {
          console.log(`Found unclosed try block at line ${tryStartLine} that ends on line ${i}`);
          // Insert a catch block
          fixedLines.splice(i + 1, 0, '  } catch (error) { console.error("Server error:", error); }');
          inTryBlock = false;
          console.log('Inserted missing catch block');
        }
      }
    }
  }
}

// Write the fixed content
fs.writeFileSync(filePath, fixedLines.join('\n'));
console.log('Saved fixed file');

// Test the file
try {
  console.log('Testing file syntax...');
  require('child_process').execSync(`node --check ${filePath}`, {stdio: 'inherit'});
  console.log('Syntax is valid!');
} catch (e) {
  console.error('Syntax is still invalid');
}
