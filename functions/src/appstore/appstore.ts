import axios from 'axios';

export interface AppStoreInfo {
  trackName: string;
  description: string;
  trackId: string;
  artworkUrl100: string;
}

// Static variable for cached data
const appStoreCache: Record<
  string,
  {
    data: AppStoreInfo;
    expiresAt: number;
  }
> = {};

/**
 * Get AppStore information for a given bundle ID
 * Results are cached for 24 hours to reduce API calls
 * @param bundleId - The iOS bundle identifier
 * @param country - The country code (e.g., 'es', 'us')
 * @returns AppStore info or undefined if not found
 */
export async function getAppStoreInfo(
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

    if (response.data && response.data.results.length > 0) {
      const appInfo: AppStoreInfo = response.data.results[0] as AppStoreInfo;

      appStoreCache[cacheKey] = {
        data: appInfo,
        expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours in ms
      };

      return appInfo;
    }

    return undefined; // App Store URL not found in the response
  } catch (error) {
    // Log error silently - AppStore info is optional
    return undefined;
  }
}
