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
  const db = getFirestore();
  const docRef = db
    .collection('_traceback_')
    .doc('installs')
    .collection('records')
    .doc(uuid);
  await docRef.delete();

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
    if (heuristicsSearch.foundEntry !== result.foundEntry) {
      result.analytics.push({
        type: AnalyticsType.DEBUG_HEURISTICS_FAILURE,
        message:
          'heuristisc whould have returned different result than unique search',
        debugObject: {
          unique: result.foundEntry,
          heuristics: heuristicsSearch.foundEntry,
        },
      });
    } else {
      result.analytics.push({
        type: AnalyticsType.DEBUG_HEURISTICS_SUCCESS,
        message:
          'heuristisc whould have returned the same result than unique search, hurray!',
        debugObject: undefined,
      });
    }
  } else {
    result = await searchByHeuristics(collection, fingerprint, ip, userAgent);
  }

  if (darkLaunchDetectedLink !== undefined) {
    if (darkLaunchDetectedLink !== result.foundEntry?.clipboard) {
      result.analytics.push({
        type: AnalyticsType.DARK_LAUNCH_MISMATCH,
        message: 'matched dark launch',
        debugObject: darkLaunchDetectedLink,
      });
    } else {
      result.analytics.push({
        type: AnalyticsType.DARK_LAUNCH_MATCH,
        message: 'dark launch mismatch',
        debugObject: {
          darkLaunch: darkLaunchDetectedLink,
          traceback: result.foundEntry.clipboard,
        },
      });
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
    return match.score > 0;
  });
  matches = matches.sort((a, b) => b.score - a.score);
  const bestMatch = matches[0] ?? undefined;

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
      uuld: bestMatch.uuid,
    };
  } else {
    const analytics: AnalyticsMessage[] = [];
    if (matches.length > 1) {
      analytics.push({
        type: AnalyticsType.HEURISTICS_MULTIPLE_MATCHES,
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
    .where('clipboard', '==', fingerprint.uniqueMatchLinkToCheck)
    .get();

  if (snapshot.empty) {
    const tracebackIdForDarkLaunch = extractTracebackIdFromDynamicLink(
      uniqueMatchLinkToCheck,
    );
    if (tracebackIdForDarkLaunch === undefined) {
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
      const docRef = collection.doc(tracebackIdForDarkLaunch);
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
      uuld: firstDoc.id,
    };
  }
}

function extractTracebackIdFromDynamicLink(
  dynamicLinkUrl: string,
): string | undefined {
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
    return tracebackId || undefined;
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

  // 3. Language must match normalized (with replacement)
  const normalizedEntryLang = entry.language.replace('_', '-').toLowerCase();
  const normalizedDeviceLang = device.languageCode
    .replace('_', '-')
    .toLowerCase();

  if (normalizedEntryLang !== normalizedDeviceLang) {
    return 0;
  }

  // ✅ Resolution, timezone, language matched
  let score = 5;

  // Extra point if original casing of timezone matches exactly
  if (entry.timezone === device.timezone) {
    score += 1;
  }

  // Extra point if language matches exactly before replacing
  if (entry.language === device.languageCode) {
    score += 1;
  }

  // IP: must match if both present, otherwise return 0
  if (entry.ip !== undefined && ip !== undefined) {
    if (entry.ip !== ip) return 0;
    score += 5;
  }

  // User Agent: must match if both present, otherwise return 0
  if (entry.userAgent !== undefined && userAgent !== undefined) {
    const uaScore = matchWithAppUserAgent(
      fingerprint.device.deviceModelName,
      userAgent,
      entry.userAgent,
    );
    if (uaScore == 0) {
      return 0;
    }
    score += uaScore;

    const osVersionScore = osVersionMatches(
      fingerprint.osVersion,
      entry.userAgent,
    );
    if (osVersionScore == 0) {
      return 0;
    }
    score += osVersionScore;
  }

  return score;
}

function matchWithAppUserAgent(
  deviceModel: string,
  appUserAgent: string,
  browserUserAgent: string,
): number {
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .split(/[\s,;()\/]+/)
      .filter(Boolean);

  const modelParts = normalize(deviceModel);
  const appUA = appUserAgent.toLowerCase();
  const browserUA = browserUserAgent.toLowerCase();

  let score = 0;

  // deviceModel in browserUA
  if (modelParts.some((part) => browserUA.includes(part))) {
    score += 2;
  }

  // deviceModel in appUA
  if (modelParts.some((part) => appUA.includes(part))) {
    score += 2;
  }

  // appUA overlaps with browserUA
  const appTokens = normalize(appUserAgent);
  const browserTokens = normalize(browserUserAgent);
  const shared = appTokens.filter((token) => browserTokens.includes(token));
  if (shared.length >= 2) {
    score += 2;
  } else if (shared.length === 1) {
    score += 1;
  }

  return score;
}

function osVersionMatches(
  osVersionFromApp: string,
  browserUserAgent: string,
): number {
  const normalizedAppVersion = osVersionFromApp.replace('.', '_'); // 17.4 -> 17_4
  const major = osVersionFromApp.split('.')[0]; // 17

  const browserUA = browserUserAgent.toLowerCase();

  if (browserUA.includes(normalizedAppVersion)) {
    return 2; // full match
  }

  if (
    browserUA.includes(`ios ${major}`) ||
    browserUA.includes(`android ${major}`) ||
    browserUA.includes(`${major}_`)
  ) {
    return 1; // partial match on major version
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
    .collection('_traceback')
    .doc('installs')
    .collection('records')
    .where(
      'createdAt',
      '<',
      Timestamp.fromMillis(Date.now() - minutes * 60 * 1000),
    )
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}
