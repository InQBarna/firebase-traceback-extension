import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import DynamicLink from '../types';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Config } from '../config';

export const link_preview = async function (
    req: Request,
    res: Response,
    hostname: string,
    config: Config
) {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

    // Get Firestore instance
    const db = admin.firestore();

    const collection = db.collection('_traceback_');

    // Parse link data
    const urlObject = new URL(req.baseUrl, 'https://example.com');
    const linkPath = urlObject.pathname;

    // Fetch link document
    const snapshotQuery = collection.where('path', '==', linkPath).limit(1);
    const linkSnapshot = await snapshotQuery.get();


    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const scheme = isEmulator ? 'http' : 'https';
    const host = req.headers.host ?? hostname;

    // If not found, return 404
    const linkFound = linkSnapshot.docs.length !== 0;
    let source: string;
    if (!linkFound) {
        source = await getUnknownLinkResponse(scheme, host, fullUrl, config);
    } else {
        const dynamicLink = linkSnapshot.docs[0].data() as DynamicLink;
        source = await getPreviewLinkResponse(scheme, host, dynamicLink, config);
    }

    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(source);
};

interface LinkInfo {
  title: string;
  description: string;
  image: string;
  followLink?: URL;
  expires: number;
  appStoreInfo?: AppStoreInfo;
}

async function getPreviewLinkResponse(
    scheme: string,
    host: string,
    dynamicLink: DynamicLink,
    config: Config
): Promise<string> {
  let linkInfo = await getFirestoreDynamicLinkInfo(dynamicLink, config);
  return getDynamicLinkHTMLResponse(scheme, host, linkInfo, config);
}

async function getUnknownLinkResponse(
    scheme: string,
    host: string,
    url: string,
    config: Config
): Promise<string> {

  // Get iOS AppStore appID
  let appStoreInfo: AppStoreInfo | undefined = await getAppStoreID(config.iosBundleID, 'es');

  return getDynamicLinkHTMLResponse(
    scheme,
    host,
    {
      title: '',
      description: 'app store description',
      image: '',
      followLink: new URL('about:blank'),
      expires: (new Date()).getTime(),
      appStoreInfo: appStoreInfo
    },
    config
  );
}

async function getFirestoreDynamicLinkInfo(
    dynamicLink: DynamicLink,
    config: Config
): Promise<LinkInfo> {
  // Gather metadata
  let title = dynamicLink.title || '';
  let description = dynamicLink.description || '';
  let image = dynamicLink.image || '';

  const followLink = dynamicLink.followLink || 'about:blank';
  const expires = dynamicLink.expires;

  let expiresNumber: number = expires?.toMillis() as number;
  if (expiresNumber && expiresNumber < Date.now()) {
    throw {expired: true};
  }

  // Get iOS AppStore appID
  // TODO: static var with appStoreID
  let appStoreInfo: AppStoreInfo | undefined = await getAppStoreID(config.iosBundleID, 'es');

  return {
    title: title,
    description: description,
    image: image,
    followLink: new URL(followLink),
    expires: expiresNumber,
    appStoreInfo: appStoreInfo
  }
}

async function getDynamicLinkHTMLResponse(
    scheme: string,
    host: string,
    linkInfo: LinkInfo,
    config: Config
): Promise<string> {


  const templatePath = path.join(__dirname, '../assets/html/index.html');
  return fs
    .readFileSync(templatePath, { encoding: 'utf-8' })
    .replaceAll('{{title}}', linkInfo.title)
    .replaceAll('{{description}}', linkInfo.description)
    .replaceAll('{{appStoreID}}', linkInfo.appStoreInfo?.trackId ?? '')
    .replaceAll('{{androidBundleID}}', config.androidBundleID)
    .replaceAll('{{androidScheme}}', (config.androidScheme ?? '').toString())
    .replaceAll('{{followLink}}', linkInfo.followLink?.toString() ?? '')
    .replaceAll('{{thumbnail}}', linkInfo.image)
    .replaceAll('{{darkLaunchDomain}}', config.darkLaunchDomain ?? '')
    .replaceAll('{{app_name}}', linkInfo.appStoreInfo?.trackName ?? '')
    .replaceAll('{{app_description}}', linkInfo.appStoreInfo?.description ?? '')
}

interface AppStoreInfo {
  trackName: string
  description: string
  trackId: string
}

// Get AppStore numeric ID
// TODO: static save of appstore link
async function getAppStoreID(bundleId: string, country: string): Promise<AppStoreInfo | undefined> {
  try {
    const response = await axios.get(
      `http://itunes.apple.com/lookup?bundleId=${bundleId}&country=${country}`,
    );

    if (response.data && response.data.results.length > 0) {
      const appInfo: AppStoreInfo = response.data.results[0] as AppStoreInfo;
      return appInfo
    }

    return undefined; // App Store URL not found in the response
  } catch (error) {
    // functions.logger.error('Error fetching data from iTunes API:', error);
    return undefined;
  }
}
