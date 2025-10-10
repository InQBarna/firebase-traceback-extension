import * as admin from 'firebase-admin';

export interface LinkAnalytics {
  clicks: number;
  opens: number;
  installs: number;
  reopens: number;
}

export enum AnalyticsEventType {
  CLICK = 'clicks',
  OPEN = 'opens',
  INSTALL = 'installs',
  REOPEN = 'reopens',
}

export async function trackLinkAnalytics(
  linkId: string,
  eventType: AnalyticsEventType,
): Promise<void> {
  const db = admin.firestore();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  const analyticsDocRef = db
    .collection('_traceback_')
    .doc('dynamiclinks')
    .collection('records')
    .doc(linkId)
    .collection('analytics')
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
          opens: 0,
          installs: 0,
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
      .collection('_traceback_')
      .doc('dynamiclinks')
      .collection('records')
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
