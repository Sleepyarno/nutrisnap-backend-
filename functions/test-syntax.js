// Simple script to test the syntax of detection.js
try {
  const detection = require('./src/food/detection');
  console.log('Syntax check passed! Module loaded successfully.');
  console.log('Exported functions:', Object.keys(detection));
} catch (error) {
  console.error('Syntax error in detection.js:');
  console.error(error);
}
