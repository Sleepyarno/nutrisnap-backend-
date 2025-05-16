// Fix detection.js file
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/food/detection.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the content by ensuring proper ending
content = content.replace(/\s*$/, '\n'); // Remove trailing whitespace and add a single newline

// Write back the fixed content
fs.writeFileSync(filePath, content);
console.log('Fixed detection.js file');
