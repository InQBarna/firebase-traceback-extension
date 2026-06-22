import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
  ANALYTICS_COLLECTION,
} from '../common/constants';
import { Platform } from '../common/platform';

// Re-export platform utilities for convenience
export {
  Platform,
  getPlatformFromUserAgent,
  getPlatformFromSdkVersion,
  parsePlatformParam,
} from '../common/platform';

export enum AnalyticsEventType {
  OPEN_LINK_PREVIEW = 'open_link_preview',
  REDIRECT = 'redirects',
  APP_FIRST_OPEN_INTENT = 'first_opens_intent',
  APP_FIRST_OPEN_INSTALL = 'first_opens_install',
  APP_REOPEN = 'reopens',
}

interface LinkAnalyticsField {
  [Platform.DESKTOP]: number;
  [Platform.ANDROID]: number;
  [Platform.IOS]: number;
}

interface LinkAnalytics {
  [AnalyticsEventType.OPEN_LINK_PREVIEW]: LinkAnalyticsField;
  [AnalyticsEventType.REDIRECT]: LinkAnalyticsField;
  [AnalyticsEventType.APP_FIRST_OPEN_INTENT]: LinkAnalyticsField;
  [AnalyticsEventType.APP_FIRST_OPEN_INSTALL]: LinkAnalyticsField;
  [AnalyticsEventType.APP_REOPEN]: LinkAnalyticsField;
}

function createEmptyAnalyticsField(): LinkAnalyticsField {
  return {
    [Platform.DESKTOP]: 0,
    [Platform.ANDROID]: 0,
    [Platform.IOS]: 0,
  };
}

export async function trackLinkAnalytics(
  linkId: string,
  eventType: AnalyticsEventType,
  platform: Platform,
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

  functions.logger.info(`Tracking ${eventType} for link ${linkId} on ${today} (platform: ${platform})`);
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(analyticsDocRef);

      if (doc.exists) {
        const data = doc.data() as LinkAnalytics;
        const currentField = data[eventType] || createEmptyAnalyticsField();
        const updatedField: LinkAnalyticsField = {
          ...createEmptyAnalyticsField(),
          ...currentField,
          [platform]: (currentField[platform] || 0) + 1,
        };
        transaction.update(analyticsDocRef, {
          [eventType]: updatedField,
        });
      } else {
        const newAnalytics: LinkAnalytics = {
          [AnalyticsEventType.OPEN_LINK_PREVIEW]: createEmptyAnalyticsField(),
          [AnalyticsEventType.REDIRECT]: createEmptyAnalyticsField(),
          [AnalyticsEventType.APP_FIRST_OPEN_INTENT]:
            createEmptyAnalyticsField(),
          [AnalyticsEventType.APP_FIRST_OPEN_INSTALL]:
            createEmptyAnalyticsField(),
          [AnalyticsEventType.APP_REOPEN]: createEmptyAnalyticsField(),
        };
        newAnalytics[eventType][platform] = 1;
        transaction.set(analyticsDocRef, newAnalytics);
      }
    });
    functions.logger.info(`Successfully tracked ${eventType} for link ${linkId}`);
  } catch (error) {
    // Log error but don't fail the operation
    functions.logger.error(`Error tracking ${eventType} for link ${linkId}:`, error);
  }
}

/**
 * Track analytics for a link by extracting the path from a URL
 * @param url - The full URL containing the link path (e.g., from clipboard)
 * @param eventType - The type of analytics event to track
 * @param platform - The platform dimension (desktop, android, ios)
 */
export async function trackLinkAnalyticsByUrl(
  url: string,
  eventType: AnalyticsEventType,
  platform: Platform,
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
      await trackLinkAnalytics(linkDoc.id, eventType, platform);
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
