import axios from 'axios';
import { AppStoreInfo } from './appstore';

// Static variable for cached data. `data` can be `undefined` — a "not found
// in this region" result is cached too, so repeat visitors from a country
// the app isn't shown as available in don't keep re-scraping Play Store.
const playStoreCache: Record<
  string,
  {
    data: AppStoreInfo | undefined;
    expiresAt: number;
  }
> = {};

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

async function lookupPlayStoreInfo(
  packageName: string,
  language: string,
  country: string,
): Promise<AppStoreInfo | undefined> {
  const cacheKey = `${packageName}_${language}_${country}`;
  const now = Date.now();

  const cached = playStoreCache[cacheKey];
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    // `hl` sets the page language, `gl` sets the region Play Store renders
    // content/availability for — the closest equivalent to the App Store
    // lookup's `country` param.
    const response = await axios.get(
      `https://play.google.com/store/apps/details?id=${packageName}&hl=${language}&gl=${country.toUpperCase()}`,
      { headers: { 'Accept-Language': language } },
    );

    const html = response.data as string;

    const title = extractMetaContent(html, 'og:title') ?? '';
    const description = extractMetaContent(html, 'og:description') ?? '';
    const icon = extractMetaContent(html, 'og:image') ?? '';

    const appInfo: AppStoreInfo | undefined = title
      ? {
          trackName: title,
          description,
          artworkUrl100: icon,
          trackId: '', // not applicable for Play Store
        }
      : undefined;

    playStoreCache[cacheKey] = {
      data: appInfo,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours in ms
    };

    return appInfo;
  } catch (_error) {
    // Log error silently - Play Store info is optional. Don't cache network
    // errors, only genuine "not found in this region" results.
    return undefined;
  }
}

/**
 * Get Play Store information for a given package name by parsing Open Graph
 * meta tags from the store page.
 *
 * Tries the given country's region first. If the app isn't shown as
 * available there, falls back to the US region (keeping the visitor's own
 * language for display) — same reasoning as getAppStoreInfo: there's no API
 * to know which countries an app is actually published in.
 * Results are cached for 24 hours to reduce scraping calls.
 * @param packageName - The Android package name
 * @param language - The display language (e.g., 'en', 'es') — from resolveLocale
 * @param country - The country/region code (e.g., 'es', 'us') — from resolveLocale
 * @returns AppStoreInfo-shaped object or undefined if not found in either region
 */
export async function getPlayStoreInfo(
  packageName: string | undefined,
  language: string,
  country: string,
): Promise<AppStoreInfo | undefined> {
  if (!packageName) return undefined;

  const info = await lookupPlayStoreInfo(packageName, language, country);
  if (info) return info;

  if (country.toLowerCase() !== 'us') {
    return lookupPlayStoreInfo(packageName, language, 'us');
  }

  return undefined;
}
