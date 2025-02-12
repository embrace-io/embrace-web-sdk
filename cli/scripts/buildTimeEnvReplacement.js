#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

/**
 * Replaces environment variables in the given file with their values.
 * @param {string} filePath - The path to the file to process.
 */
async function replaceEnvVariables(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Regular expression to match process.env.<VARIABLE_NAME>
    const regex = /process\.env\.([a-zA-Z0-9_]+)/g;

    // Replace environment variables with their actual values
    const newContent = fileContent.replace(regex, (match, envVarName) => {
      const envValue = process.env[envVarName];
      if (envValue === undefined) {
        console.warn(
          `Environment variable ${envVarName} not found. Using empty string.`
        );
        return '""'; // Or a default value
      }
      return JSON.stringify(envValue);
    });

    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`File ${filePath} processed successfully.`);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    process.exit(1);
  }
}

/**
 * Recursively processes all files in the given directory.
 * @param {string} directory - The directory to process.
 */
async function processDirectory(directory) {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    // Use for...of loop for async/await
    const fullPath = path.join(directory, file);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      await processDirectory(fullPath); // Await recursive calls
    } else if (
      stats.isFile() &&
      (file.endsWith('.js') || file.endsWith('.ts'))
    ) {
      await replaceEnvVariables(fullPath); // Await file processing
    }
  }
}

async function main() {
  // Main async function
  const targetDirectory = path.resolve(process.argv[2]);
  console.log(`Processing directory: ${targetDirectory}`); // Log the directory being processed
  await processDirectory(targetDirectory);
}

main(); // Call the main function
