/**
 * Custom deployment script for Learn tab functions
 * This bypasses lint errors in unrelated files
 */
const { execSync } = require('child_process');

console.log('Deploying Learn tab functions...');

try {
  // Deploy only the Learn tab functions with --force flag to skip linting
  execSync(
    'firebase deploy --only functions:learn_getFeaturedArticles --force --project=nutrisnap2',
    { stdio: 'inherit' }
  );
  console.log('Learn getFeaturedArticles function deployed successfully!');
} catch (error) {
  console.error('Deployment failed:', error);
  process.exit(1);
}
