import * as functions from 'firebase-functions/v1';
import { config } from './config';
import {
  privateInitialize,
  ExtensionInitializationResult,
} from './lifecycle/initialize';
import axios from 'axios';
import { getSiteId } from './common/site-utils';

export interface DoctorResult {
  extensionInitialization: ExtensionInitializationResult;
  appleAppSizeAssociationOk: boolean;
  configuration: {
    domain: string;
    projectID: string;
    extensionID: string;
    location: string;
    iosTeamID: string;
    iosBundleID: string;
    androidBundleID: string;
  };
  diagnostics: {
    siteId: string;
    expectedSiteName: string;
    hostingURL: string;
    appleAssociationURL: string;
    appleAssociationError?: string;
    initializationAttempted: boolean;
    initializationError?: string;
  };
}

export const private_doctor = functions
  .region('europe-west1')
  .https.onRequest(async (req, res): Promise<void> => {
    try {
      // Get the actual host from the request (works with custom domains)
      const actualHost = req.get('host') || getSiteId(config) + '.web.app';
      const actualSiteName = `${req.protocol}://${actualHost}`;

      // Calculate expected site configuration
      const siteId = getSiteId(config);
      const expectedSiteName = `https://${siteId}.web.app`;
      const appleAssociationURL = `${actualSiteName}/.well-known/apple-app-site-association`;

      // Initialize diagnostics
      let appleAppSiteAssociationOk = false;
      let appleAssociationError: string | undefined;
      let initializationAttempted = false;
      let initializationError: string | undefined;
      let initResult: ExtensionInitializationResult;

      // Test Apple App Site Association (non-destructive)
      try {
        functions.logger.info(
          'Testing Apple App Site Association:',
          appleAssociationURL,
        );
        const appleSiteAssociation = await axios.get(appleAssociationURL, {
          timeout: 5000,
          headers: { 'User-Agent': 'Traceback-Doctor/1.0' },
        });

        if (appleSiteAssociation.data && appleSiteAssociation.data.applinks) {
          appleAppSiteAssociationOk =
            appleSiteAssociation.data.applinks.length > 0;
          functions.logger.info(
            'Apple App Site Association response:',
            appleSiteAssociation.data,
          );
        } else {
          appleAssociationError = 'Response missing applinks property';
        }
      } catch (error: any) {
        appleAssociationError =
          error.message || 'Failed to fetch Apple App Site Association';
        functions.logger.warn(
          'Apple App Site Association error:',
          appleAssociationError,
        );
      }

      // Attempt initialization (READ-ONLY - no creation/modification)
      try {
        functions.logger.info('Attempting read-only initialization check...');
        initializationAttempted = true;

        // Call with createRemoteHost=false and createSetupData=false for read-only check
        initResult = await privateInitialize(false, config, false);

        functions.logger.info(
          'Read-only initialization completed successfully:',
          initResult,
        );
      } catch (error: any) {
        initializationError = error.message || 'Unknown initialization error';
        functions.logger.error('Initialization failed:', initializationError);

        // Provide fallback result
        initResult = {
          siteAlreadyExisted: false,
          siteCreatedViaAPI: false,
          siteName: expectedSiteName,
          error: initializationError,
        };
      }

      const doctorResult: DoctorResult = {
        extensionInitialization: initResult,
        appleAppSizeAssociationOk: appleAppSiteAssociationOk,
        configuration: {
          domain: config.domain,
          projectID: config.projectID,
          extensionID: config.extensionID,
          location: config.location,
          iosTeamID: config.iosTeamID,
          iosBundleID: config.iosBundleID,
          androidBundleID: config.androidBundleID,
        },
        diagnostics: {
          siteId: siteId,
          expectedSiteName: expectedSiteName,
          hostingURL: actualSiteName,
          appleAssociationURL: appleAssociationURL,
          appleAssociationError: appleAssociationError,
          initializationAttempted: initializationAttempted,
          initializationError: initializationError,
        },
      };

      functions.logger.info('Doctor check completed:', doctorResult);
      res.status(200).json(doctorResult);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error('Doctor endpoint error:', errorMessage, error);

      res.status(500).json({
        error: 'Doctor check failed',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  });
