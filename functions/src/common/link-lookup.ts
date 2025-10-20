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

/**
 * Parse direct link from URL query parameter
 * Handles URL format: https://domain.web.app/path?link=https://direct.link
 * @param urlString - The URL to parse
 * @returns The direct link from query parameter or undefined
 */
export function parseDirectLinkFromUrl(urlString: string): string | undefined {
  try {
    const url = new URL(urlString);
    return url.searchParams.get('link') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve traceback link following the fallback logic:
 * 1. Try to find campaign by path (returns campaign's followLink)
 * 2. If not found, try to parse direct link from URL query parameter
 * 3. Return the resolved link or undefined
 *
 * Examples:
 * - "https://domain.web.app/campaign" -> finds campaign, returns followLink
 * - "https://domain.web.app/path?link=https://direct.link" -> returns "https://direct.link"
 * - "https://domain.web.app/unknown?link=https://fallback.com" -> returns "https://fallback.com"
 *
 * @param link - The traceback link to resolve
 * @returns The resolved link or undefined
 */
export async function resolveTracebackLink(
  link: string,
): Promise<string | undefined> {
  try {
    const url = new URL(link);
    const linkPath = url.pathname;

    // First, try to find campaign by path
    const linkResult = await findDynamicLinkByPath(linkPath);

    if (linkResult?.data.followLink) {
      // Campaign found, return its followLink
      return linkResult.data.followLink;
    }

    // Campaign not found, try to parse direct link from URL
    const directLink = parseDirectLinkFromUrl(link);
    return directLink;
  } catch {
    // Invalid URL
    return undefined;
  }
}
