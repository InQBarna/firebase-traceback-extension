import { logger } from 'firebase-functions/v2';
import { Request, Response } from 'express';
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

export const private_retry_initialize = async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info(
        '[RETRY_INITIALIZE] Starting manual initialization retry',
      );

      // Call initialization with createRemoteHost=true and createSetupData=true
      // This will attempt to create hosting, rewrites, and sample data
      const initResult = await privateInitialize(true, config, true);

      logger.info('[RETRY_INITIALIZE] Initialization completed', {
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
      logger.error(
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
};
