import { Request, Response } from 'express';
import DynamicLink from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config';
import {
  trackLinkAnalytics,
  AnalyticsEventType,
  getPlatformFromUserAgent,
} from '../analytics/track-analytics';
import { AppStoreInfo, getAppStoreInfo } from '../appstore/appstore';
import { getPlayStoreInfo } from '../appstore/playstore';
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
  console.log('Link path:', linkPath);
  const linkResult = await findDynamicLinkByPath(linkPath);

  const host =
    req.headers['x-forwarded-host'] ?? req.headers.host ?? siteId + '.web.app';
  const fullUrl = `${req.protocol}://${host}${req.originalUrl}`;
  const scheme = isEmulator ? 'http' : 'https';
  // Always use the configured hostname (not req.headers.host which can be the Cloud Functions domain)
  // const host = isEmulator ? (req.headers.host ?? hostname) : hostname;

  // If not found, return default response
  let source: string;
  const countryCode = 'es';
  console.log('Link result:', linkResult);
  if (!linkResult) {
    source = await getUnknownLinkResponse(config, countryCode);
  } else {
    const dynamicLink = linkResult.data;
    const currentUrl = new URL(fullUrl);
    const tb_prev_tracked = 'tb_prev_tracked';
    const utm_source = 'utm_source';
    const utm_medium = 'utm_medium';
    const link = 'link';

    // Track the open before redirecting, only if not already tracked
    if (!currentUrl.searchParams.has(tb_prev_tracked)) {
      const platform = getPlatformFromUserAgent(req.headers['user-agent']);
      await trackLinkAnalytics(
        linkResult.id,
        AnalyticsEventType.OPEN_LINK_PREVIEW,
        platform,
      );
    }

    // If followLink is available, redirect with link parameter (if missing)
    if (dynamicLink.followLink && !currentUrl.searchParams.has(link)) {
      // Inject referral UTMs from Referer header if no utm_source is set
      const referer = req.headers.referer || req.headers.referrer;
      if (referer && !currentUrl.searchParams.has(utm_source)) {
        try {
          const refererDomain = new URL(referer as string).hostname;
          currentUrl.searchParams.set(utm_source, refererDomain);
          currentUrl.searchParams.set(utm_medium, 'referral_traceback');
        } catch {
          // Invalid referer URL, ignore
        }
      }

      // Forward UTM parameters to the followLink
      const followLinkUrl = new URL(dynamicLink.followLink);
      // Copy UTM parameters from the current request to the followLink
      for (const [key, value] of currentUrl.searchParams.entries()) {
        if (key.startsWith('utm_')) {
          followLinkUrl.searchParams.set(key, value);
        }
      }

      // Use the correct scheme and host (not the internal Cloud Functions domain)
      const redirectUrl = new URL(`${scheme}://${host}${req.originalUrl}`);
      redirectUrl.searchParams.set(link, followLinkUrl.toString());

      // Mark request as already tracked preview
      redirectUrl.searchParams.set(tb_prev_tracked, 'true');

      res.setHeader('Cache-Control', 'no-cache');
      return res.redirect(302, redirectUrl.toString());
    }
    source = await getPreviewLinkResponse(dynamicLink, config, countryCode);
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
  appleAffiliateToken?: string;
  appleCampaignText?: string;
  appleMediaType?: string;
  appleProviderId?: string;
  clipboardTrackingEnabled: boolean;
}

async function getPreviewLinkResponse(
  dynamicLink: DynamicLink,
  config: Config,
  countryCode: string,
): Promise<string> {
  const linkInfo = await getFirestoreDynamicLinkInfo(
    dynamicLink,
    config,
    countryCode,
  );
  return getDynamicLinkHTMLResponse(linkInfo, config);
}

async function getUnknownLinkResponse(
  config: Config,
  countryCode: string,
): Promise<string> {
  // Fetch app metadata: prefer App Store (iOS), fall back to Play Store (Android)
  const appStoreInfo: AppStoreInfo | undefined = config.iosBundleID
    ? await getAppStoreInfo(config.iosBundleID, countryCode)
    : await getPlayStoreInfo(config.androidBundleID, countryCode);

  return getDynamicLinkHTMLResponse(
    {
      title: appStoreInfo?.trackName ?? '',
      description: appStoreInfo?.description ?? '',
      image: appStoreInfo?.artworkUrl100 ?? '',
      followLink: new URL('about:blank'),
      expires: new Date().getTime(),
      appStoreInfo: appStoreInfo,
      // Clipboard tracking always enabled for programmatic links for now,
      // pending a decision on whether a global flag could disable it.
      clipboardTrackingEnabled: true,
    },
    config,
  );
}

async function getFirestoreDynamicLinkInfo(
  dynamicLink: DynamicLink,
  config: Config,
  countryCode: string,
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

  // Fetch app metadata: prefer App Store (iOS), fall back to Play Store (Android)
  const appStoreInfo: AppStoreInfo | undefined = config.iosBundleID
    ? await getAppStoreInfo(config.iosBundleID, countryCode)
    : await getPlayStoreInfo(config.androidBundleID, countryCode);

  return {
    title: title,
    description: description,
    image: image,
    followLink: new URL(followLink),
    expires: expiresNumber,
    appStoreInfo: appStoreInfo,
    appleAffiliateToken: dynamicLink.appleAffiliateToken,
    appleCampaignText: dynamicLink.appleCampaignText,
    appleMediaType: dynamicLink.appleMediaType,
    appleProviderId: dynamicLink.appleProviderId,
    clipboardTrackingEnabled: dynamicLink.clipboardTrackingEnabled ?? true,
  };
}

async function getDynamicLinkHTMLResponse(
  linkInfo: LinkInfo,
  config: Config,
): Promise<string> {
  const thumbnail = linkInfo.image.length > 0 ? linkInfo.image : ''; // : (linkInfo.appStoreInfo?.artworkUrl100 ?? '');
  const appIcon = linkInfo.appStoreInfo?.artworkUrl100 ?? '';

  const pageData = {
    appName: linkInfo.appStoreInfo?.trackName ?? '',
    appIcon,
    appDescription:
      linkInfo.appStoreInfo?.description.replace(/\n/g, '<br/>') ?? '',
    title: linkInfo.title,
    description: linkInfo.description,
    thumbnail,
    appStoreID: linkInfo.appStoreInfo?.trackId ?? '',
    androidBundleID: config.androidBundleID ?? '',
    androidScheme: config.androidScheme ?? '',
    appleAffiliateToken: linkInfo.appleAffiliateToken ?? '',
    appleCampaignText: linkInfo.appleCampaignText ?? '',
    appleMediaType: linkInfo.appleMediaType ?? '',
    appleProviderId: linkInfo.appleProviderId ?? '',
    followLink: linkInfo.followLink?.toString() ?? '',
    clipboardTrackingEnabled: linkInfo.clipboardTrackingEnabled,
  };

  const templatePath = path.join(__dirname, '../assets/html/index.html');
  const html = fs.readFileSync(templatePath, { encoding: 'utf-8' });

  return html
    .replaceAll('{{title}}', linkInfo.title)
    .replaceAll('{{description}}', linkInfo.description)
    .replaceAll('{{thumbnail}}', thumbnail)
    .replaceAll('{{app_icon}}', appIcon)
    .replace(
      '<!-- __DATA__ -->',
      `<script>window.__DATA__=${JSON.stringify(pageData)}</script>`,
    );
}
