# Integration Tests

This directory contains integration tests for the Firebase Traceback extension.

## Test Types

### Integration Tests (`*.integration.test.ts`)
These tests run against Firebase emulators and test the complete flow:
- Make HTTP requests to Cloud Functions
- Directly read/write to Firestore emulator
- Verify end-to-end behavior

### Unit Tests (`*.test.ts`)
Traditional unit tests using mocks and stubs.

## Running Tests

### Prerequisites
1. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Start Firebase emulators (in a separate terminal):
   ```bash
   cd functions/integration-tests
   firebase emulators:start
   ```

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- installs.integration.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

## Writing Integration Tests

Integration tests follow this pattern:

```typescript
import * as request from 'supertest';
import * as admin from 'firebase-admin';
import { TRACEBACK_COLLECTION } from '../src/common/constants';

// Initialize Firebase Admin for emulator
if (!admin.apps.length) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  admin.initializeApp({ projectId: 'demo-project' });
}

const db = admin.firestore();

describe('My Feature', () => {
  beforeEach(async () => {
    // Clean up Firestore before each test
    const snapshot = await db.collection(TRACEBACK_COLLECTION).get();
    // ... delete documents
  });

  test('should do something', async () => {
    // 1. Setup data in Firestore
    await db.collection('myCollection').add({ ... });

    // 2. Verify Firestore data
    const doc = await db.collection('myCollection').doc('id').get();
    expect(doc.exists).toBe(true);
  });
});
```

## Running Against Production

To run tests against a real Firebase project (not recommended for CI):

1. Set environment variables:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   ```

2. Update the Firebase Admin initialization in your test file to remove emulator settings.

3. Run tests:
   ```bash
   npm test
   ```

**Warning:** Running integration tests against production will create/delete real data!

## Environment Variables

- `TRACEBACK_API_URL` - Base URL for hosting (default: `http://127.0.0.1:5002`)
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key (for production tests only)

## Test Coverage

Generate coverage reports:
```bash
npm test -- --coverage
```

View coverage in browser:
```bash
open coverage/lcov-report/index.html
```
