import { Request, Response } from 'express';
import DynamicLink from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config';
import {
  trackLinkAnalytics,
  AnalyticsEventType,
} from '../analytics/track-analytics';
import { AppStoreInfo, getAppStoreInfo } from '../appstore/appstore';
import { findDynamicLinkByPath } from '../common/link-lookup';

export const link_preview = async function (
  req: Request,
  res: Response,
  siteId: string,
  config: Config,
) {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

  // Parse link data
  const urlObject = new URL(req.baseUrl, 'https://example.com');
  const linkPath = urlObject.pathname;

  // Find the dynamic link by path
  const linkResult = await findDynamicLinkByPath(linkPath);

  const host =
    req.headers['x-forwarded-host'] ?? req.headers.host ?? siteId + '.web.app';
  const fullUrl = `${req.protocol}://${host}${req.originalUrl}`;
  const scheme = isEmulator ? 'http' : 'https';
  // Always use the configured hostname (not req.headers.host which can be the Cloud Functions domain)
  // const host = isEmulator ? (req.headers.host ?? hostname) : hostname;

  // If not found, return default response
  let source: string;
  if (!linkResult) {
    source = await getUnknownLinkResponse(config);
  } else {
    // If followLink is available, redirect with link parameter
    const dynamicLink = linkResult.data;
    const currentUrl = new URL(fullUrl);
    if (dynamicLink.followLink && !currentUrl.searchParams.has('link')) {
      // Track the open before redirecting
      await trackLinkAnalytics(linkResult.id, AnalyticsEventType.CLICK);

      // Use the correct scheme and host (not the internal Cloud Functions domain)
      const redirectUrl = new URL(`${scheme}://${host}${req.originalUrl}`);
      redirectUrl.searchParams.set('link', dynamicLink.followLink);
      res.setHeader('Cache-Control', 'no-cache');
      return res.redirect(302, redirectUrl.toString());
    }
    source = await getPreviewLinkResponse(dynamicLink, config);
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
  dynamicLink: DynamicLink,
  config: Config,
): Promise<string> {
  const linkInfo = await getFirestoreDynamicLinkInfo(dynamicLink, config);
  return getDynamicLinkHTMLResponse(linkInfo, config);
}

async function getUnknownLinkResponse(config: Config): Promise<string> {
  // Get iOS AppStore appID
  const appStoreInfo: AppStoreInfo | undefined = await getAppStoreInfo(
    config.iosBundleID,
    'es',
  );

  return getDynamicLinkHTMLResponse(
    {
      title: '',
      description: 'app store description',
      image: '',
      followLink: new URL('about:blank'),
      expires: new Date().getTime(),
      appStoreInfo: appStoreInfo,
    },
    config,
  );
}

async function getFirestoreDynamicLinkInfo(
  dynamicLink: DynamicLink,
  config: Config,
): Promise<LinkInfo> {
  // Gather metadata
  const title = dynamicLink.title || '';
  const description = dynamicLink.description || '';
  const image = dynamicLink.image || '';

  const followLink = dynamicLink.followLink || 'about:blank';
  const expires = dynamicLink.expires;

  const expiresNumber: number = expires?.toMillis() as number;
  if (expiresNumber && expiresNumber < Date.now()) {
    throw { expired: true };
  }

  // Get iOS AppStore appID
  // TODO: static var with appStoreID
  const appStoreInfo: AppStoreInfo | undefined = await getAppStoreInfo(
    config.iosBundleID,
    'es',
  );

  return {
    title: title,
    description: description,
    image: image,
    followLink: new URL(followLink),
    expires: expiresNumber,
    appStoreInfo: appStoreInfo,
  };
}

async function getDynamicLinkHTMLResponse(
  linkInfo: LinkInfo,
  config: Config,
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
    .replaceAll(
      '{{thumbnail}}',
      linkInfo.image.length > 0
        ? linkInfo.image
        : (linkInfo.appStoreInfo?.artworkUrl100 ?? ''),
    )
    .replaceAll('{{app_name}}', linkInfo.appStoreInfo?.trackName ?? '')
    .replaceAll(
      '{{app_description}}',
      linkInfo.appStoreInfo?.description ?? '',
    );
}
