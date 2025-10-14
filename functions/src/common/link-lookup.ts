import * as admin from 'firebase-admin';
import DynamicLink from '../types';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
} from './constants';

/**
 * Result of finding a dynamic link by path
 */
export interface DynamicLinkResult {
  /** The Firestore document ID */
  id: string;
  /** The dynamic link data */
  data: DynamicLink;
}

/**
 * Find a dynamic link by path
 * @param linkPath - The path to search for (e.g., "/summer")
 * @returns The dynamic link document and data if found, undefined otherwise
 */
export async function findDynamicLinkByPath(
  linkPath: string,
): Promise<DynamicLinkResult | undefined> {
  const db = admin.firestore();
  const collection = db
    .collection(TRACEBACK_COLLECTION)
    .doc(DYNAMICLINKS_DOC)
    .collection(RECORDS_COLLECTION);

  const snapshotQuery = collection.where('path', '==', linkPath).limit(1);
  const linkSnapshot = await snapshotQuery.get();

  if (linkSnapshot.empty) {
    return undefined;
  }

  const linkDoc = linkSnapshot.docs[0];
  return {
    id: linkDoc.id,
    data: linkDoc.data() as DynamicLink,
  };
}
