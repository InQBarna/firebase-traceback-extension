import * as admin from 'firebase-admin';
import DynamicLink from '../src/types';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
} from '../src/common/constants';
import { getTestFirestore } from './test-utils';

/**
 * Create a single dynamic link in the test database
 */
export const createDynamicLink = async (
  link: Omit<DynamicLink, 'createdAt' | 'updatedAt'>,
): Promise<string> => {
  const db = getTestFirestore();

  const linkData = {
    ...link,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  const docRef = await db
    .collection(TRACEBACK_COLLECTION)
    .doc(DYNAMICLINKS_DOC)
    .collection(RECORDS_COLLECTION)
    .add(linkData);

  return docRef.id;
};

/**
 * Create multiple dynamic links in the test database
 */
export const createDynamicLinks = async (
  links: Array<Omit<DynamicLink, 'createdAt' | 'updatedAt'>>,
): Promise<string[]> => {
  const ids: string[] = [];

  for (const link of links) {
    const id = await createDynamicLink(link);
    ids.push(id);
  }

  return ids;
};

/**
 * Common test links that can be reused across tests
 */
export const testLinks = {
  example: {
    path: '/example',
    title: 'Example Link',
    description: 'Test link for examples',
    followLink: 'https://example.com/test/deep/link',
  },
  summer: {
    path: '/summer',
    title: 'Summer Sale',
    description: 'Test link for summer sale',
    followLink: 'https://example.com/products/summer-sale',
  },
  feature: {
    path: '/feature',
    title: 'Feature Test',
    description: 'Test link for features',
    followLink: 'https://example.com/feature',
  },
};
