import * as functions from 'firebase-functions/v1';

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
        functions.logger.error(logMessage, logData);
        break;
      case InstallAnalyticsType.HEURISTICS_MULTIPLE_MATCHES:
        functions.logger.info(logMessage, logData);
        break;
      case InstallAnalyticsType.HEURISTICS_MULTIPLE_MATCHES_SAME_SCORE:
        functions.logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.HEURISTICS_NOT_FOUND:
        functions.logger.info(logMessage, logData);
        break;
      case InstallAnalyticsType.PASTEBOARD_MULTIPLE_MATCHES:
        functions.logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.PASTEBOARD_NOT_FOUND:
        functions.logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.DEBUG_HEURISTICS_FAILURE:
        functions.logger.warn(logMessage, logData);
        break;
      case InstallAnalyticsType.DEBUG_HEURISTICS_SUCCESS:
        functions.logger.info(logMessage, logData);
        break;
    }
  }
}
