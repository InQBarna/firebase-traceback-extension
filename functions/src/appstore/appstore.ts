import axios from 'axios';

export interface AppStoreInfo {
  trackName: string;
  description: string;
  trackId: string;
  artworkUrl100: string;
}

// Static variable for cached data. `data` can be `undefined` — a "not found
// in this storefront" result is cached too, so repeat visitors from a
// country the app isn't published in don't keep re-querying iTunes.
const appStoreCache: Record<
  string,
  {
    data: AppStoreInfo | undefined;
    expiresAt: number;
  }
> = {};

async function lookupAppStoreInfo(
  bundleId: string,
  country: string,
): Promise<AppStoreInfo | undefined> {
  const cacheKey = `${bundleId}_${country}`;
  const now = Date.now();

  const cached = appStoreCache[cacheKey];
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `http://itunes.apple.com/lookup?bundleId=${bundleId}&country=${country}`,
    );

    const appInfo: AppStoreInfo | undefined =
      response.data && response.data.results.length > 0
        ? (response.data.results[0] as AppStoreInfo)
        : undefined;

    appStoreCache[cacheKey] = {
      data: appInfo,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours in ms
    };

    return appInfo;
  } catch (_error) {
    // Log error silently - AppStore info is optional. Don't cache network
    // errors, only genuine "not found in this storefront" results.
    return undefined;
  }
}

/**
 * Get AppStore information for a given bundle ID.
 *
 * Tries the given country's storefront first. If the app isn't found there
 * (it may simply not be published in that country — there's no API to know
 * which countries an app IS available in), falls back to the US storefront.
 * Results are cached for 24 hours to reduce API calls.
 * @param bundleId - The iOS bundle identifier
 * @param country - The country code (e.g., 'es', 'us')
 * @returns AppStore info or undefined if not found in either storefront
 */
export async function getAppStoreInfo(
  bundleId: string | undefined,
  country: string,
): Promise<AppStoreInfo | undefined> {
  if (!bundleId) return undefined;

  const info = await lookupAppStoreInfo(bundleId, country);
  if (info) return info;

  if (country.toLowerCase() !== 'us') {
    return lookupAppStoreInfo(bundleId, 'us');
  }

  return undefined;
}
