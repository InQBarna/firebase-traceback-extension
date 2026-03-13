import * as functions from 'firebase-functions/v1';
import { config } from './config';
import {
  privateInitialize,
  ExtensionInitializationResult,
} from './lifecycle/initialize';

export interface RetryInitializeResult {
  success: boolean;
  initializationResult?: ExtensionInitializationResult;
  error?: string;
  timestamp: string;
}

export const private_retry_initialize = functions
  .region('europe-west1')
  .https.onRequest(async (req, res): Promise<void> => {
    try {
      functions.logger.info(
        '[RETRY_INITIALIZE] Starting manual initialization retry',
      );

      // Call initialization with createRemoteHost=true and createSetupData=true
      // This will attempt to create hosting, rewrites, and sample data
      const initResult = await privateInitialize(true, config, true);

      functions.logger.info('[RETRY_INITIALIZE] Initialization completed', {
        siteAlreadyExisted: initResult.siteAlreadyExisted,
        siteCreatedViaAPI: initResult.siteCreatedViaAPI,
        siteName: initResult.siteName,
        error: initResult.error,
        samples: initResult.samples,
      });

      const result: RetryInitializeResult = {
        success: !initResult.error,
        initializationResult: initResult,
        timestamp: new Date().toISOString(),
      };

      if (initResult.error) {
        result.error = initResult.error;
        res.status(500).json(result);
      } else {
        res.status(200).json(result);
      }
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error(
        '[RETRY_INITIALIZE] Retry failed:',
        errorMessage,
        error,
      );

      const result: RetryInitializeResult = {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };

      res.status(500).json(result);
    }
  });
