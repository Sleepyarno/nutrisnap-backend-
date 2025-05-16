#!/bin/bash
# Fix the trailing comma in the return object (line ~949)
sed -i '' 's/nutrition: mergedResult,/nutrition: mergedResult/' src/food/detection.js

# Remove any duplicate nutrition field
sed -i '' '/nutrition: nutritionResult,/d' src/food/detection.js

# Remove the orphaned try block at line 73
sed -i '' '73s/try {//' src/food/detection.js

echo "Fixed syntax errors in detection.js"
