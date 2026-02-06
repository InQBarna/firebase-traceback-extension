export enum Platform {
  DESKTOP = 'desktop',
  ANDROID = 'android',
  IOS = 'ios',
}

/**
 * Detect platform from user-agent string.
 * Handles both browser and native app user-agents:
 * - Browser: "iPhone", "iPad", "iPod", "Android"
 * - Native iOS: "Darwin", "CFNetwork"
 * - Native Android: "okhttp", "Dalvik"
 */
export function getPlatformFromUserAgent(
  userAgent: string | undefined,
): Platform {
  if (!userAgent) {
    return Platform.DESKTOP;
  }

  const ua = userAgent.toLowerCase();

  // Check for iOS - browser and native app user-agents
  if (
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod') ||
    ua.includes('darwin') ||
    ua.includes('cfnetwork')
  ) {
    return Platform.IOS;
  }

  // Check for Android - browser and native app user-agents
  if (
    ua.includes('android') ||
    ua.includes('okhttp') ||
    ua.includes('dalvik')
  ) {
    return Platform.ANDROID;
  }

  // Default to desktop for everything else (Windows, Mac, Linux, etc.)
  return Platform.DESKTOP;
}

/**
 * Parse platform from SDK version string.
 * Format: "ios/X.Y.Z", "android/X.Y.Z", or "X.Y.Z" (legacy format)
 * Returns undefined if the format doesn't indicate a platform.
 */
export function getPlatformFromSdkVersion(
  sdkVersion: string | undefined,
): Platform | undefined {
  if (!sdkVersion) {
    return undefined;
  }

  const version = sdkVersion.toLowerCase();

  if (version.startsWith('ios/')) {
    return Platform.IOS;
  }

  if (version.startsWith('android/')) {
    return Platform.ANDROID;
  }

  // Legacy format (X.Y.Z) - cannot determine platform
  return undefined;
}

/**
 * Parse platform from query parameter string.
 * Returns undefined if the value is not a valid Platform.
 */
export function parsePlatformParam(
  platformParam: string | undefined,
): Platform | undefined {
  if (!platformParam) {
    return undefined;
  }

  const normalized = platformParam.toLowerCase();
  if (normalized === Platform.IOS) {
    return Platform.IOS;
  }
  if (normalized === Platform.ANDROID) {
    return Platform.ANDROID;
  }
  if (normalized === Platform.DESKTOP) {
    return Platform.DESKTOP;
  }

  return undefined;
}
