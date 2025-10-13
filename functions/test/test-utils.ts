import * as admin from 'firebase-admin';
import {
  TRACEBACK_COLLECTION,
  INSTALLS_DOC,
  RECORDS_COLLECTION,
  DYNAMICLINKS_DOC,
} from '../src/common/constants';

/**
 * Get the base URL for the test API
 * Can be overridden with TRACEBACK_API_URL environment variable
 */
export const getTestApiUrl = (): string => {
  return process.env.TRACEBACK_API_URL ?? 'http://127.0.0.1:5002';
};

/**
 * Initialize Firebase Admin SDK for testing with emulator
 * Only initializes once, safe to call multiple times
 * Always uses the same project ID to ensure all tests share the same database
 */
export const initializeTestFirebase = (
  projectId = 'iqbdemocms',
): admin.app.App => {
  // Always set emulator host before initializing
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId,
    });
  }
  return admin.app();
};

/**
 * Get Firestore instance for testing
 * Automatically initializes Firebase if not already initialized
 */
export const getTestFirestore = (): FirebaseFirestore.Firestore => {
  // Ensure Firebase is initialized
  if (!admin.apps.length) {
    initializeTestFirebase();
  }
  return admin.firestore();
};

/**
 * Clear all install records from the test database
 */
export const clearInstallRecords = async (): Promise<void> => {
  const db = getTestFirestore();
  const installsRef = db
    .collection(TRACEBACK_COLLECTION)
    .doc(INSTALLS_DOC)
    .collection(RECORDS_COLLECTION);

  const snapshot = await installsRef.get();

  if (snapshot.empty) {
    return;
  }

  // Delete in batches if more than 500 (Firestore limit)
  const batchSize = 500;
  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = db.batch();
    const batchDocs = snapshot.docs.slice(i, i + batchSize);
    batchDocs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
};

/**
 * Clear all dynamic link records from the test database
 * Deletes both the documents and their analytics subcollections
 */
export const clearDynamicLinkRecords = async (): Promise<void> => {
  const db = getTestFirestore();
  const linksRef = db
    .collection(TRACEBACK_COLLECTION)
    .doc(DYNAMICLINKS_DOC)
    .collection(RECORDS_COLLECTION);

  const snapshot = await linksRef.get();

  if (snapshot.empty) {
    return;
  }

  // Delete each document and its subcollections
  for (const doc of snapshot.docs) {
    // First delete analytics subcollection
    const analyticsSnapshot = await doc.ref.collection('analytics').get();
    if (!analyticsSnapshot.empty) {
      const analyticsBatch = db.batch();
      analyticsSnapshot.docs.forEach((analyticsDoc) =>
        analyticsBatch.delete(analyticsDoc.ref),
      );
      await analyticsBatch.commit();
    }

    // Then delete the parent document
    await doc.ref.delete();
  }
};

/**
 * Cleanup function to close Firebase connections after tests
 * Call this in afterAll() hooks
 */
export const cleanupTestFirebase = async (): Promise<void> => {
  if (admin.apps.length > 0) {
    await admin.app().delete();
  }
};

/**
 * Helper to generate unique test IDs to avoid test interference
 */
export const generateUniqueTestId = (): string => {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

/**
 * Sleep helper for tests that need to wait for async operations
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
