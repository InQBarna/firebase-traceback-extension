import { logger } from 'firebase-functions/v2';

/**
 * Types of analytics events for install attribution tracking
 */
export enum InstallAnalyticsType {
  ERROR = 'ERROR',
  PASTEBOARD_MULTIPLE_MATCHES = 'PASTEBOARD_MULTIPLE_MATCHES',
  PASTEBOARD_NOT_FOUND = 'PASTEBOARD_NOT_FOUND',
  HEURISTICS_NOT_FOUND = 'HEURISTICS_NOT_FOUND',
  HEURISTICS_MULTIPLE_MATCHES = 'HEURISTICS_MULTIPLE_MATCHES',
  HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE = 'HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE',
  DEBUG_HEURISTICS_SUCCESS = 'DEBUG_HEURISTICS_SUCCESS',
  DEBUG_HEURISTICS_FAILURE = 'DEBUG_HEURISTICS_FAILURE',
}

/**
 * Analytics message for install attribution events
 */
export interface PostInstallDebugLog {
  type: InstallAnalyticsType;
  message: string;
  debugObject: any | undefined;
}

/**
 * Log install analytics messages to Firebase Functions logger
 * @param analytics - Array of analytics messages to log
 */
export function logPostInstallDebugInfo(
  analytics: PostInstallDebugLog[],
): void {
  for (const element of analytics) {
    const logData = JSON.stringify({ debugObject: element.debugObject });
    const logMessage = `${element.type.toString()}: ${element.message}`;

    switch (element.type) {
      case InstallAnalyticsType.ERROR:
        logger.error(logMessage, logData);
        break;
      case InstallAnalyticsType.HEURISTICS_MULTIPLE_MATCHES:
        logger.info(logMessage, logData);
        break;
      case InstallAnalyticsType.HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE:
        logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.HEURISTICS_NOT_FOUND:
        logger.info(logMessage, logData);
        break;
      case InstallAnalyticsType.PASTEBOARD_MULTIPLE_MATCHES:
        logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.PASTEBOARD_NOT_FOUND:
        logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.DEBUG_HEURISTICS_FAILURE:
        logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.DEBUG_HEURISTICS_SUCCESS:
        logger.info(logMessage, logData);
        break;
    }
  }
}
