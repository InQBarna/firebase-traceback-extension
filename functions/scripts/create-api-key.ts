import * as admin from 'firebase-admin';
import { TRACEBACK_COLLECTION, APIKEYS_DOC, RECORDS_COLLECTION } from '../src/common/constants';
import { initializeFirebase, getEnvironment } from './setup-dummy-data';

// Initialize Firebase
initializeFirebase();

const db = admin.firestore();

async function createDefaultAPIKey(): Promise<void> {
  const environment = getEnvironment();
  console.log(`Creating default API key in ${environment}...\n`);

  const apiKeysCollection = db
    .collection(TRACEBACK_COLLECTION)
    .doc(APIKEYS_DOC)
    .collection(RECORDS_COLLECTION);

  // Check if any API keys exist
  const existingKeys = await apiKeysCollection.limit(1).get();

  if (!existingKeys.empty) {
    console.log('⏭️  API key already exists, skipping creation');
    console.log('\nℹ️  To view existing keys, check Firestore at:');
    console.log(`   _traceback_/apikeys/records/`);
    process.exit(0);
  }

  // Create a hardcoded API key for development/testing
  const hardcodedApiKey = 'dev-api-key-12345';

  await apiKeysCollection.add({
    value: hardcodedApiKey,
    description:
      'Default API key created by setup script for development/testing',
    createdAt: admin.firestore.Timestamp.now(),
  });

  console.log(`✓ Created default API key: ${hardcodedApiKey}`);
  console.log('\n📝 Use this key to access secured endpoints:');
  console.log(`   curl -H "x-traceback-api-key: ${hardcodedApiKey}" \\`);
  console.log(`     http://localhost:5002/v1_doctor`);
  console.log('\n✅ API key creation complete!');
  process.exit(0);
}

createDefaultAPIKey().catch((error) => {
  console.error('❌ Error creating API key:', error);
  process.exit(1);
});
