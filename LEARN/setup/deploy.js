/**
 * NutriSnap - Learn Tab - Deployment Script
 * 
 * This script helps automate the deployment process for the Learn tab backend.
 * It supports different environments (dev, test, prod) and provides a streamlined
 * workflow for seeding content and deploying Firebase functions.
 */

// Load environment variables from .env file
require('dotenv').config();

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import the seeding function
const { importArticlesToFirestore } = require('./seedFirestore');

// Environment settings
const ENVIRONMENTS = {
  dev: {
    projectId: 'nutrisnap-dev',
    functionsDir: path.join(__dirname, 'functions')
  },
  test: {
    projectId: 'nutrisnap-test',
    functionsDir: path.join(__dirname, 'functions')
  },
  prod: {
    projectId: 'nutrisnap-prod',
    functionsDir: path.join(__dirname, 'functions')
  }
};

/**
 * Executes a shell command and returns a Promise
 * @param {string} command - The command to execute
 * @param {string} cwd - Current working directory
 * @returns {Promise<string>} - Command output
 */
function executeCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${command}`);
    
    const process = exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      resolve(stdout);
    });

    // Stream output to console
    process.stdout.on('data', (data) => {
      console.log(data.toString().trim());
    });
  });
}

/**
 * Validates the environment is properly set up
 * @param {string} env - Environment name (dev, test, prod)
 */
async function validateEnvironment(env) {
  if (!ENVIRONMENTS[env]) {
    throw new Error(`Invalid environment: ${env}. Must be one of: ${Object.keys(ENVIRONMENTS).join(', ')}`);
  }

  const environment = ENVIRONMENTS[env];
  
  // Check if functions directory exists
  if (!fs.existsSync(environment.functionsDir)) {
    throw new Error(`Functions directory not found: ${environment.functionsDir}`);
  }
  
  // Check if service account key is available (either as env var or file)
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH environment variable not set');
  }
  
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account key file not found: ${serviceAccountPath}`);
  }
  
  console.log(`Environment ${env} validated successfully.`);
}

/**
 * Seeds Firestore with content from the content directory
 */
async function seedContent() {
  console.log('Seeding Firestore with content...');
  try {
    await importArticlesToFirestore();
    console.log('Content seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding content:', error);
    throw error;
  }
}

/**
 * Installs npm dependencies for Firebase Functions
 * @param {string} env - Environment name
 */
async function installFunctionsDependencies(env) {
  const environment = ENVIRONMENTS[env];
  console.log(`Installing dependencies for Firebase Functions (${env})...`);
  
  try {
    await executeCommand('npm install', environment.functionsDir);
    console.log('Dependencies installed successfully.');
  } catch (error) {
    console.error('Error installing dependencies:', error);
    throw error;
  }
}

/**
 * Deploys Firebase Functions
 * @param {string} env - Environment name
 */
async function deployFunctions(env) {
  const environment = ENVIRONMENTS[env];
  console.log(`Deploying Firebase Functions to ${env}...`);
  
  try {
    // Select Firebase project
    await executeCommand(`firebase use ${environment.projectId}`, environment.functionsDir);
    
    // Deploy only functions
    await executeCommand('firebase deploy --only functions', environment.functionsDir);
    
    console.log(`Firebase Functions deployed successfully to ${env}.`);
  } catch (error) {
    console.error('Error deploying functions:', error);
    throw error;
  }
}

/**
 * Main deployment function
 * @param {string} env - Environment name (dev, test, prod)
 * @param {boolean} seedContentFlag - Whether to seed content
 */
async function deploy(env, seedContentFlag = false) {
  try {
    console.log(`Starting deployment process for ${env} environment...`);
    
    // Validate environment
    await validateEnvironment(env);
    
    // Seed content if requested
    if (seedContentFlag) {
      await seedContent();
    }
    
    // Install dependencies
    await installFunctionsDependencies(env);
    
    // Deploy functions
    await deployFunctions(env);
    
    console.log(`Deployment to ${env} completed successfully!`);
  } catch (error) {
    console.error(`Deployment to ${env} failed:`, error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const env = args[0] || 'dev'; // Default to dev environment
const seedContentFlag = args.includes('--seed-content');

// Run deployment
deploy(env, seedContentFlag);
