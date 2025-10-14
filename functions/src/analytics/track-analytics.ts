import * as admin from 'firebase-admin';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
  ANALYTICS_COLLECTION,
} from '../common/constants';

interface LinkAnalytics {
  clicks: number;
  redirects: number;
  first_opens_intent: number;
  first_opens_install: number;
  reopens: number;
}

export enum AnalyticsEventType {
  CLICK = 'clicks',
  REDIRECT = 'redirects',
  APP_FIRST_OPEN_INTENT = 'first_opens_intent',
  APP_FIRST_OPEN_INSTALL = 'first_opens_install',
  APP_REOPEN = 'reopens',
}

export async function trackLinkAnalytics(
  linkId: string,
  eventType: AnalyticsEventType,
): Promise<void> {
  const db = admin.firestore();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  const analyticsDocRef = db
    .collection(TRACEBACK_COLLECTION)
    .doc(DYNAMICLINKS_DOC)
    .collection(RECORDS_COLLECTION)
    .doc(linkId)
    .collection(ANALYTICS_COLLECTION)
    .doc(today);

  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(analyticsDocRef);

      if (doc.exists) {
        const data = doc.data() as LinkAnalytics;
        transaction.update(analyticsDocRef, {
          [eventType]: (data[eventType] || 0) + 1,
        });
      } else {
        const newAnalytics: LinkAnalytics = {
          clicks: 0,
          redirects: 0,
          first_opens_intent: 0,
          first_opens_install: 0,
          reopens: 0,
        };
        newAnalytics[eventType] = 1;
        transaction.set(analyticsDocRef, newAnalytics);
      }
    });
  } catch (error) {
    // Log error but don't fail the operation
    console.error(`Error tracking ${eventType} for link ${linkId}:`, error);
  }
}

/**
 * Track analytics for a link by extracting the path from a URL
 * @param url - The full URL containing the link path (e.g., from clipboard)
 * @param eventType - The type of analytics event to track
 */
export async function trackLinkAnalyticsByUrl(
  url: string,
  eventType: AnalyticsEventType,
): Promise<void> {
  try {
    // Extract path from the URL
    const linkUrl = new URL(url);
    const linkPath = linkUrl.pathname;

    // Early return if path is root
    if (linkPath === '/') {
      return;
    }

    const db = admin.firestore();
    const linkSnapshot = await db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION)
      .where('path', '==', linkPath)
      .limit(1)
      .get();

    if (!linkSnapshot.empty) {
      const linkDoc = linkSnapshot.docs[0];
      await trackLinkAnalytics(linkDoc.id, eventType);
    } else {
      // Log error if path looks valid but no link found
      console.error(
        `Link not found in records for ${eventType}: path="${linkPath}" from URL="${url}"`,
      );
    }
  } catch (error) {
    // Log error but don't fail the operation
    console.error(`Error tracking ${eventType} for URL ${url}:`, error);
  }
}
