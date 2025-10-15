import * as admin from 'firebase-admin';

/**
 * Common setup for all scripts
 * Checks if running in production mode and initializes Firebase accordingly
 */
export function initializeFirebase(): void {
  const isProduction = process.argv.includes('--prod');

  if (isProduction) {
    console.log('🔧 Using Production Firebase\n');

    // Check for credentials
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error(
        '❌ Error: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.',
      );
      console.error(
        'Please set it to the path of your service account key JSON file.',
      );
      process.exit(1);
    }

    // Initialize with service account credentials
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } else {
    console.log('🔧 Using Firebase Emulators\n');

    // Set emulator environment variables
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

    // Initialize for emulator
    admin.initializeApp({
      projectId: 'iqbdemocms',
    });
  }
}

/**
 * Get the current environment (production or emulator)
 */
export function getEnvironment(): string {
  return process.argv.includes('--prod') ? 'production' : 'local emulator';
}
