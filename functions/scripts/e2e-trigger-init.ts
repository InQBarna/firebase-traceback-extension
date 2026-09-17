/**
 * E2E helper: ensures the extension is initialized by:
 * 1. Reading (or creating) an API key from Firestore using the service account
 * 2. Calling POST /v1_retry_initialize on the hosting domain
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json \
 *   npx tsx scripts/e2e-trigger-init.ts --domain traceback-extension-samples-traceback.web.app
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import {
  TRACEBACK_COLLECTION,
  APIKEYS_DOC,
  RECORDS_COLLECTION,
} from '../src/common/constants';

const args = process.argv.slice(2);
const domainArg = args.find(a => a.startsWith('--domain='));
if (!domainArg) {
  console.error('Usage: e2e-trigger-init.ts --domain=<hosting-domain>');
  process.exit(1);
}
const domain = domainArg.replace('--domain=', '');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS must be set');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function getOrCreateApiKey(): Promise<string> {
  const collection = db
    .collection(TRACEBACK_COLLECTION)
    .doc(APIKEYS_DOC)
    .collection(RECORDS_COLLECTION);

  const existing = await collection.limit(1).get();
  if (!existing.empty) {
    const key = existing.docs[0].data().value as string;
    console.log('Using existing API key from Firestore.');
    return key;
  }

  const apiKey = 'e2e-init-key-' + Date.now();
  await collection.add({
    value: apiKey,
    description: 'Temporary key created by e2e-trigger-init.ts',
    createdAt: Timestamp.now(),
  });
  console.log('Created temporary API key in Firestore.');
  return apiKey;
}

async function triggerInit(apiKey: string): Promise<void> {
  const url = `https://${domain}/v1_retry_initialize`;
  const MAX_ATTEMPTS = 6;
  const RETRY_DELAY_MS = 20000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Calling POST ${url} (attempt ${attempt}/${MAX_ATTEMPTS})...`);
    try {
      const response = await axios.post(url, {}, {
        headers: { 'x-traceback-api-key': apiKey },
        timeout: 60000,
      });
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(response.data, null, 2));
      if (!response.data?.success) {
        console.error('Initialization reported failure:', response.data?.error);
        process.exit(1);
      }
      console.log('Initialization successful.');
      return;
    } catch (error: any) {
      const status = error?.response?.status;
      const msg = error?.response?.data ?? error?.message ?? String(error);
      console.warn(`Attempt ${attempt} failed (status ${status ?? 'network'}):`, msg);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  console.error(`All ${MAX_ATTEMPTS} attempts failed.`);
  process.exit(1);
}

(async () => {
  try {
    const apiKey = await getOrCreateApiKey();
    await triggerInit(apiKey);
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error?.response?.data ?? error?.message ?? error);
    process.exit(1);
  }
})();
