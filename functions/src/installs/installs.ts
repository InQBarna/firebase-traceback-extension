import * as functions from 'firebase-functions/v1';
import { Request, Response } from 'express';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { Timestamp } from 'firebase-admin/firestore';
import * as Joi from 'joi';
import {
  DeviceFingerprint,
  DeviceHeuristics,
  SavedDeviceHeuristics,
  TraceBackMatchResponse,
} from './types';

export const deviceFingerprintSchema = Joi.object({
  appInstallationTime: Joi.number().required(),
  bundleId: Joi.string().required(),
  osVersion: Joi.string().required(),
  sdkVersion: Joi.string().required(),
  uniqueMatchLinkToCheck: Joi.string().uri().optional(),
  darkLaunchDetectedLink: Joi.string().uri().optional(),
  device: Joi.object({
    deviceModelName: Joi.string().required(),
    languageCode: Joi.string().required(),
    languageCodeFromWebView: Joi.string().optional(),
    languageCodeRaw: Joi.string().required(),
    appVersionFromWebView: Joi.string().optional(),
    screenResolutionWidth: Joi.number().required(),
    screenResolutionHeight: Joi.number().required(),
    timezone: Joi.string().required(),
  }).required(),
});

interface MatchResult {
  match: SavedDeviceHeuristics;
  score: number;
  uuid: string;
}

enum AnalyticsType {
  ERROR = 'ERROR',
  PASTEBOARD_MULTIPLE_MATCHES = 'PASTEBOARD_MULTIPLE_MATCHES',
  PASTEBOARD_NOT_FOUND = 'PASTEBOARD_NOT_FOUND',
  HEURISTICS_NOT_FOUND = 'HEURISTICS_NOT_FOUND',
  HEURISTICS_MULTIPLE_MATCHES = 'HEURISTICS_MULTIPLE_MATCHES',
  HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE = 'HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE',
  DARK_LAUNCH_MATCH = 'DARK_LAUNCH_MATCH',
  DARK_LAUNCH_MISMATCH = 'DARK_LAUNCH_MISMATCH',
  DEBUG_HEURISTICS_SUCCESS = 'DEBUG_HEURISTICS_SUCCESS',
  DEBUG_HEURISTICS_FAILURE = 'DEBUG_HEURISTICS_FAILURE',
}

interface AnalyticsMessage {
  type: AnalyticsType;
  message: string;
  debugObject: any | undefined;
}

interface PostInstallResult {
  foundEntry: SavedDeviceHeuristics | undefined;
  uniqueMatch: boolean | undefined;
  analytics: AnalyticsMessage[];
  uuld: string | undefined;
}

interface LinkExtraction {
  dynamicLinkUrl: URL;
  tracebackId: string | undefined;
  dynamicLinkUrlWithoutTracebackId: URL;
}

export const private_v1_postinstall_search_link = functions
  .region('europe-west1')
  .https.onRequest(async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { error, value } = deviceFingerprintSchema.validate(req.body);
    if (error) {
      res
        .status(400)
        .json({ error: 'Invalid payload', details: error.details });
      return;
    }

    try {
      // 1.- SEARCH
      const fingerprint = value as DeviceFingerprint;
      const ip: string | undefined =
        req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ??
        req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'] || undefined;
      const darkLaunchDetectedLink = fingerprint.darkLaunchDetectedLink;
      const result = await searchPostInstall(
        fingerprint,
        ip,
        userAgent,
        darkLaunchDetectedLink,
      );

      // 2.- ANALYTICS
      for (let index = 0; index < result.analytics.length; index++) {
        const element = result.analytics[index];
        switch (element.type) {
          case AnalyticsType.ERROR:
            functions.logger.error(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.HEURISTICS_MULTIPLE_MATCHES:
            functions.logger.info(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE:
            functions.logger.warn(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.HEURISTICS_NOT_FOUND:
            functions.logger.info(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.PASTEBOARD_MULTIPLE_MATCHES:
            functions.logger.warn(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.PASTEBOARD_NOT_FOUND:
            functions.logger.warn(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.DARK_LAUNCH_MATCH:
            functions.logger.info(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.DARK_LAUNCH_MISMATCH:
            functions.logger.error(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.DEBUG_HEURISTICS_FAILURE:
            functions.logger.warn(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
          case AnalyticsType.DEBUG_HEURISTICS_SUCCESS:
            functions.logger.info(
              element.type.toString() + ': ' + element.message,
              JSON.stringify({ debugObject: element.debugObject }),
            );
            break;
        }
      }

      // 3.- Remove if grabbed
      if (result.uuld !== undefined) {
        removeFoundPostInstall(result.uuld);
      }

      // 4.- RESPONSE (+ some more analytics)
      if (result.foundEntry !== undefined) {
        const response: TraceBackMatchResponse = {
          deep_link_id: result.foundEntry.clipboard,
          match_message: result.uniqueMatch
            ? 'Link is uniquely matched for this device.'
            : 'Fuzzy link with this id',
          match_type: result.uniqueMatch ? 'unique' : 'ambiguous',
          request_ip_version: 'IP_V4',
          utm_medium: undefined,
          utm_source: undefined,
        };
        res.status(200).json(response);
      } else {
        res.status(200).json({
          deep_link_id: fingerprint.uniqueMatchLinkToCheck ?? undefined,
          match_message: 'No matching install found.',
          match_type: 'none',
          request_ip_version: 'IP_V4',
          utm_medium: undefined,
          utm_source: undefined,
        } satisfies TraceBackMatchResponse);
      }
    } catch (err) {
      console.error('Error matching fingerprint:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

async function removeFoundPostInstall(uuid: string): Promise<void> {
  // REMOVE
  try {
    const db = getFirestore();
    const docRef = db
      .collection('_traceback_')
      .doc('installs')
      .collection('records')
      .doc(uuid);
    await docRef.delete();
  } catch {
    console.error(
      `Document ${uuid} not found in records when trying removeFoundPostInstall`,
    );
  }

  // IN CASE WE WANt TO kEEY THEM
  /*
    const db = getFirestore();
    const sourceRef = db
      .collection('_traceback_')
      .doc('installs')
      .collection('records')
      .doc(uuid);
    const targetRef = db
      .collection('_traceback_')
      .doc('installs')
      .collection('attributed')
      .doc(uuid);
    const snapshot = await sourceRef.get();
    if (!snapshot.exists) {
      console.warn(`Document ${uuid} not found in records`);
      return;
    }
    const data = snapshot.data();
    await targetRef.set(data);
    await sourceRef.delete();
    */
}

async function searchPostInstall(
  fingerprint: DeviceFingerprint,
  ip: string | undefined,
  userAgent: string | undefined,
  darkLaunchDetectedLink: string | undefined,
): Promise<PostInstallResult> {
  let result: PostInstallResult;

  // Kept for reference
  // let isNotFoundFBDL = darkLaunchDetectedLink !== undefined && darkLaunchDetectedLink.indexOf('No%20pre%2Dinstall%20link%20matched%20for%20this%20device') !== -1;

  const db = getFirestore();
  const collection = db
    .collection('_traceback_')
    .doc('installs')
    .collection('records');

  if (fingerprint.uniqueMatchLinkToCheck !== undefined) {
    result = await searchByClipboardContent(
      collection,
      fingerprint,
      fingerprint.uniqueMatchLinkToCheck,
    );

    const heuristicsSearch = await searchByHeuristics(
      collection,
      fingerprint,
      ip,
      userAgent,
    );
    if (
      result.foundEntry === undefined &&
      heuristicsSearch.foundEntry !== result.foundEntry
    ) {
      result.analytics.push({
        type: AnalyticsType.DEBUG_HEURISTICS_FAILURE,
        message:
          'heuristisc would have returned different result than current successfull unique search',
        debugObject: {
          unique: result.foundEntry,
          heuristics: heuristicsSearch.foundEntry,
        },
      });
    } else {
      result.analytics.push({
        type: AnalyticsType.DEBUG_HEURISTICS_SUCCESS,
        message:
          'heuristisc would have returned the same result than unique search, hurray!',
        debugObject: undefined,
      });
    }
  } else {
    result = await searchByHeuristics(collection, fingerprint, ip, userAgent);
  }

  if (darkLaunchDetectedLink !== undefined) {
    if (result.foundEntry === undefined) {
      result.analytics.push({
        type: AnalyticsType.DARK_LAUNCH_MISMATCH,
        message: 'dark launch mismatch: no entry found',
        debugObject: {
          darkLaunch: darkLaunchDetectedLink,
        },
      });
    } else {
      const foundLink = extractTracebackIdFromDynamicLink(
        result.foundEntry.clipboard,
      );
      if (foundLink === undefined) {
        result.analytics.push({
          type: AnalyticsType.DARK_LAUNCH_MISMATCH,
          message:
            'dark launch mismatch / system error: found entry did not include link= param',
          debugObject: {
            darkLaunch: darkLaunchDetectedLink,
            result: result.foundEntry,
          },
        });
      } else if (
        foundLink.dynamicLinkUrlWithoutTracebackId.toString() !==
          darkLaunchDetectedLink &&
        foundLink.dynamicLinkUrl.toString() !== darkLaunchDetectedLink
      ) {
        result.analytics.push({
          type: AnalyticsType.DARK_LAUNCH_MISMATCH,
          message: 'dark launch mismatch',
          debugObject: {
            darkLaunch: darkLaunchDetectedLink,
            link: foundLink.dynamicLinkUrlWithoutTracebackId,
            result: result.foundEntry,
          },
        });
      } else {
        result.analytics.push({
          type: AnalyticsType.DARK_LAUNCH_MATCH,
          message: 'matched dark launch',
          debugObject: {
            darkLaunch: darkLaunchDetectedLink,
            link: result.foundEntry,
            result: result.foundEntry,
          },
        });
      }
    }
  }

  return result;
}

async function searchByHeuristics(
  collection: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
  fingerprint: DeviceFingerprint,
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<PostInstallResult> {
  const snapshot = await collection.get();

  // Optionally: match further by language, timezone, etc.
  let matches: MatchResult[] = snapshot.docs.map((doc) => {
    const data = doc.data() as SavedDeviceHeuristics;
    const score = findMatchingInstall(fingerprint, ip, userAgent, data);
    return {
      match: data,
      score: score,
      uuid: doc.id,
    } as MatchResult;
  });

  matches = matches.filter((match) => {
    // Allow small negative time differences (up to 30 seconds) to account for
    // clock synchronization issues, network delays, and quick app installations
    const timeDifference =
      fingerprint.appInstallationTime - match.match.createdAt.seconds;
    return match.score > 0 && timeDifference > -30;
  });
  matches = matches.sort((a, b) => b.score - a.score);
  const bestMatch = matches[0] ?? undefined;
  const bestMatchScore: number = bestMatch?.score ?? 1;
  const bestSecondMatchScore: number = matches[1]?.score ?? 0;

  if (bestMatch == undefined || bestMatch.score == 0) {
    return {
      foundEntry: undefined,
      uniqueMatch: false,
      analytics: [
        {
          type: AnalyticsType.HEURISTICS_NOT_FOUND,
          message: 'no match found with heuristics search',
          debugObject: {
            fingerprint: fingerprint,
            ip: ip,
            userAgent: userAgent,
          },
        },
      ],
      uuld: undefined,
    };
  } else {
    const analytics: AnalyticsMessage[] = [];
    if (matches.length > 1) {
      const sameScore = bestMatchScore == bestSecondMatchScore;
      analytics.push({
        type: sameScore
          ? AnalyticsType.HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE
          : AnalyticsType.HEURISTICS_MULTIPLE_MATCHES,
        message: 'Multiple heuristics matches',
        debugObject: {
          fingerprint: fingerprint,
          ip: ip,
          userAgent: userAgent,
          matches: matches,
        },
      });
    }
    const foundEntry = bestMatch.match as SavedDeviceHeuristics;
    return {
      foundEntry: foundEntry,
      uniqueMatch: false,
      analytics: analytics,
      uuld: bestMatch.uuid,
    };
  }
}

async function searchByClipboardContent(
  collection: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
  fingerprint: DeviceFingerprint,
  uniqueMatchLinkToCheck: string,
): Promise<PostInstallResult> {
  const snapshot = await collection
    .where('clipboard', '==', uniqueMatchLinkToCheck)
    .get();

  if (snapshot.empty) {
    const tracebackIdForDarkLaunch = extractTracebackIdFromDynamicLink(
      uniqueMatchLinkToCheck,
    );
    if (
      tracebackIdForDarkLaunch?.tracebackId === undefined ||
      tracebackIdForDarkLaunch?.tracebackId === ''
    ) {
      return {
        foundEntry: undefined,
        uniqueMatch: false,
        analytics: [
          {
            type: AnalyticsType.PASTEBOARD_NOT_FOUND,
            message:
              'no match found with pasteboard content, and could not find _tracebackid in url',
            debugObject: fingerprint.uniqueMatchLinkToCheck,
          },
        ],
        uuld: undefined,
      };
    } else {
      console.info(
        `Searching by docId (_tracebackid) ${tracebackIdForDarkLaunch.tracebackId}`,
      );
      const docRef = collection.doc(tracebackIdForDarkLaunch.tracebackId);
      const tidSnapshot = await docRef.get();
      if (!tidSnapshot.exists) {
        return {
          foundEntry: undefined,
          uniqueMatch: false,
          analytics: [
            {
              type: AnalyticsType.PASTEBOARD_NOT_FOUND,
              message:
                'no match found with pasteboard content neither by using dark launch _tracebackid',
              debugObject: fingerprint.uniqueMatchLinkToCheck,
            },
          ],
          uuld: undefined,
        };
      } else {
        return {
          foundEntry: tidSnapshot.data() as SavedDeviceHeuristics,
          uniqueMatch: true,
          analytics: [],
          uuld: tidSnapshot.id,
        };
      }
    }
  } else {
    const firstDoc = await snapshot.docs[0].data();
    const analytics: AnalyticsMessage[] = [];
    if (snapshot.docs.length > 1) {
      analytics.push({
        type: AnalyticsType.PASTEBOARD_MULTIPLE_MATCHES,
        message: 'Multiple matches found with pasteboard content',
        debugObject: fingerprint.uniqueMatchLinkToCheck,
      });
    }
    return {
      foundEntry: firstDoc as SavedDeviceHeuristics,
      uniqueMatch: true,
      analytics: analytics,
      uuld: snapshot.docs[0].id,
    };
  }
}

function extractTracebackIdFromDynamicLink(
  dynamicLinkUrl: string,
): LinkExtraction | undefined {
  try {
    const outerUrl = new URL(dynamicLinkUrl);
    const encodedLinkParam = outerUrl.searchParams.get('link');
    if (!encodedLinkParam) {
      return undefined;
    }

    // If the "link" parameter is itself a URL, it may be double-encoded
    const decodedOnce = decodeURIComponent(encodedLinkParam);
    const nestedUrl = new URL(decodedOnce);

    const tracebackId = nestedUrl.searchParams.get('_tracebackid');
    const copieddUrl = nestedUrl;
    copieddUrl.searchParams.delete('_tracebackid');
    return {
      dynamicLinkUrl: nestedUrl,
      tracebackId: tracebackId,
      dynamicLinkUrlWithoutTracebackId: copieddUrl,
    } as LinkExtraction;
  } catch (err) {
    // console.error('Failed to extract _tracebackid:', err);
    return undefined;
  }
}

export function findMatchingInstall(
  fingerprint: DeviceFingerprint,
  ip: string | undefined,
  userAgent: string | undefined,
  entry: SavedDeviceHeuristics,
): number {
  const device = fingerprint.device;

  // 1. Screen resolution must match exactly
  if (
    entry.screenWidth !== device.screenResolutionWidth ||
    entry.screenHeight !== device.screenResolutionHeight
  ) {
    return 0;
  }

  // 2. Timezone must match lowercased
  if (entry.timezone.toLowerCase() !== device.timezone.toLowerCase()) {
    return 0;
  }

  // 3. Language primary code must match, secondary gives bonus score
  const normalizedEntryLang = entry.language.replace('_', '-').toLowerCase();
  const normalizedDeviceLang = (
    device.languageCodeFromWebView ?? device.languageCode
  )
    .replace('_', '-')
    .toLowerCase();

  // Split into primary (en) and secondary (us, gb, etc.)
  const entryLangParts = normalizedEntryLang.split('-');
  const deviceLangParts = normalizedDeviceLang.split('-');

  // Primary language code must match (en, es, fr, etc.)
  if (entryLangParts[0] !== deviceLangParts[0]) {
    return 0;
  }

  // ✅ Resolution, timezone, primary language matched
  let score = 5;

  // High bonus score for exact language match (including region)
  if (normalizedEntryLang === normalizedDeviceLang) {
    score += 3; // Exact match bonus
  } else if (
    entryLangParts[1] &&
    deviceLangParts[1] &&
    entryLangParts[1] === deviceLangParts[1]
  ) {
    score += 2; // Same region bonus
  } else if (entryLangParts[1] && deviceLangParts[1]) {
    // Different regions but both specified - small penalty but still match
    score += 0; // No bonus but no penalty
  } else {
    score += 1; // One has region, one doesn't - small bonus
  }

  // Extra point if original casing of timezone matches exactly
  if (entry.timezone === device.timezone) {
    score += 1;
  }

  // Extra point if language matches exactly before replacing
  if (entry.language === device.languageCode) {
    score += 1;
  }

  // IP: bonus points if IPs match, but no penalty if they don't
  // This handles common scenarios like WiFi → cellular network switches
  if (entry.ip !== undefined && ip !== undefined && entry.ip === ip) {
    score += 5; // Bonus for IP match
  }

  // User Agent: must match if both present, otherwise return 0
  if (entry.userAgent !== undefined && userAgent !== undefined) {
    const uaScore = matchWithAppUserAgent(
      fingerprint.device.deviceModelName,
      fingerprint.device.appVersionFromWebView ?? userAgent,
      entry.userAgent,
    );
    score += uaScore;

    const osVersionScore = osVersionMatches(
      fingerprint.osVersion,
      entry.userAgent,
    );
    score += osVersionScore;
  }

  return score;
}

function matchWithAppUserAgent(
  deviceModel: string,
  appUserAgent: string,
  browserUserAgent: string,
): number {
  // Simplified approach: focus on core device model matching
  // This reduces complexity and false negatives

  const appUA = appUserAgent.toLowerCase();
  const browserUA = browserUserAgent.toLowerCase();
  const model = deviceModel.toLowerCase();

  let score = 0;

  // Primary check: device model appears in browser user agent
  // This is the most reliable signal for device matching
  if (model && browserUA.includes(model)) {
    score += 3; // Higher base score for reliable match
  }

  // Secondary check: look for model parts if full model doesn't match
  // Handle cases where model might be formatted differently
  if (score === 0 && model) {
    const modelParts = model
      .split(/[\s\-_]+/)
      .filter((part) => part.length > 2);
    if (modelParts.some((part) => browserUA.includes(part))) {
      score += 2;
    }
  }

  // Tertiary check: basic user agent overlap
  // Only add if we have some device model match to avoid false positives
  if (score > 0) {
    // Simple check for common tokens between app and browser UA
    const commonTokens = ['mobile', 'safari', 'webkit', 'chrome', 'version'];
    const appTokens = appUA.split(/\s+/).filter((token) => token.length > 3);
    const browserTokens = browserUA
      .split(/\s+/)
      .filter((token) => token.length > 3);

    const hasCommonTokens = commonTokens.some(
      (token) => appUA.includes(token) && browserUA.includes(token),
    );

    if (
      hasCommonTokens ||
      appTokens.some((token) => browserTokens.includes(token))
    ) {
      score += 1;
    }
  }

  return score;
}

function osVersionMatches(
  osVersionFromApp: string,
  browserUserAgent: string,
): number {
  // Simplified OS version matching - focus on major version compatibility
  // This reduces false negatives from minor version differences

  if (!osVersionFromApp || !browserUserAgent) {
    return 0;
  }

  const browserUA = browserUserAgent.toLowerCase();
  const appVersion = osVersionFromApp.toLowerCase();

  // Extract major version number (e.g., "17.4.1" -> "17")
  const majorVersionMatch = appVersion.match(/^(\d+)/);
  if (!majorVersionMatch) {
    return 0;
  }

  const majorVersion = majorVersionMatch[1];

  // Check for exact version match (most reliable)
  if (browserUA.includes(appVersion)) {
    return 3;
  }

  // Check for version with underscore format (iOS format: 17_4)
  const underscoreVersion = appVersion.replace(/\./g, '_');
  if (browserUA.includes(underscoreVersion)) {
    return 3;
  }

  // Check for major version compatibility (more tolerant)
  // This helps with minor version differences that shouldn't block matches
  const majorVersionPatterns = [
    `ios ${majorVersion}`,
    `android ${majorVersion}`,
    `${majorVersion}_`,
    `os ${majorVersion}`,
  ];

  if (majorVersionPatterns.some((pattern) => browserUA.includes(pattern))) {
    return 2;
  }

  return 0;
}

export const deviceHeuristicsSchema = Joi.object({
  language: Joi.string().allow(null),
  languages: Joi.array().items(Joi.string()).allow(null),
  timezone: Joi.string().allow(null),
  screenWidth: Joi.number().required(),
  screenHeight: Joi.number().required(),
  devicePixelRatio: Joi.number().allow(null),
  platform: Joi.string().allow(null),
  userAgent: Joi.string().allow(null),
  connectionType: Joi.string().allow(null),
  hardwareConcurrency: Joi.number().allow(null),
  memory: Joi.number().allow(null),
  colorDepth: Joi.number().allow(null),
  clipboard: Joi.string().allow(null),
});

export const private_v1_preinstall_save_link = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Validate with Joi
    const { error, value } = deviceHeuristicsSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid payload',
        details: error.details,
      });
      return;
    }

    const heuristics: DeviceHeuristics = value;
    const installId: string = uuidv4();
    const ip: string | undefined =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ??
      req.socket.remoteAddress;

    let payload: SavedDeviceHeuristics;
    if (undefined !== ip) {
      payload = {
        ...heuristics,
        createdAt: Timestamp.now(),
        ip: ip,
      };
    } else {
      payload = {
        ...heuristics,
        createdAt: Timestamp.now(),
      };
    }

    const db = getFirestore();
    await db
      .collection('_traceback_')
      .doc('installs')
      .collection('records')
      .doc(installId)
      .set(payload);

    await oldInstallsMaintenance(db);

    res.status(200).json({ success: true, installId });
  } catch (err) {
    functions.logger.error(
      'Error saving device heuristics:',
      JSON.stringify({ error: err }),
    );
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

// Installations cleanup

let cleanupCount = 0;
export async function oldInstallsMaintenance(db: Firestore): Promise<void> {
  cleanupCount++;
  if (cleanupCount % 10 !== 0) return; // only run every 10th call
  try {
    await deleteOldInstalls(30, db);
  } catch (err) {
    functions.logger.error(
      'Failed to delete old installs during this call',
      JSON.stringify({ error: err }),
    );
  }
}

export async function deleteOldInstalls(
  minutes: number,
  db: Firestore,
): Promise<void> {
  const snapshot = await db
    .collection('_traceback_')
    .doc('installs')
    .collection('records')
    .where(
      'createdAt',
      '<',
      Timestamp.fromMillis(Date.now() - minutes * 60 * 1000),
    )
    .limit(100) // Important! below 500 allways
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}
