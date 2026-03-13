import axios from 'axios';
import { AppStoreInfo } from './appstore';

// Static variable for cached data
const playStoreCache: Record<
  string,
  {
    data: AppStoreInfo;
    expiresAt: number;
  }
> = {};

/**
 * Get Play Store information for a given package name by parsing Open Graph
 * meta tags from the store page. Results are cached for 24 hours.
 * Returns data mapped to AppStoreInfo so it can be used interchangeably.
 * @param packageName - The Android package name
 * @param language - The language code (e.g., 'es', 'en')
 * @returns AppStoreInfo-shaped object or undefined if not found
 */
export async function getPlayStoreInfo(
  packageName: string | undefined,
  language: string,
): Promise<AppStoreInfo | undefined> {
  if (!packageName) return undefined;

  const cacheKey = `${packageName}_${language}`;
  const now = Date.now();

  const cached = playStoreCache[cacheKey];
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `https://play.google.com/store/apps/details?id=${packageName}&hl=${language}`,
      { headers: { 'Accept-Language': language } },
    );

    const html = response.data as string;

    const title = extractMetaContent(html, 'og:title') ?? '';
    const description = extractMetaContent(html, 'og:description') ?? '';
    const icon = extractMetaContent(html, 'og:image') ?? '';

    if (!title) return undefined;

    const appInfo: AppStoreInfo = {
      trackName: title,
      description,
      artworkUrl100: icon,
      trackId: '', // not applicable for Play Store
    };

    playStoreCache[cacheKey] = {
      data: appInfo,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours in ms
    };

    return appInfo;
  } catch (_error) {
    // Log error silently - Play Store info is optional
    return undefined;
  }
}

function extractMetaContent(
  html: string,
  property: string,
): string | undefined {
  const match =
    html.match(
      new RegExp(
        `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
        'i',
      ),
    ) ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
        'i',
      ),
    );
  return match?.[1];
}
