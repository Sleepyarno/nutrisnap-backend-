#!/bin/bash
# Fix EOF issues by removing any trailing whitespace and ensuring proper line ending
sed -i '' -e :a -e '/^\n*$/{$d;N;ba' -e '}' src/food/detection.js
echo "" >> src/food/detection.js  # Add a single newline at end of file
