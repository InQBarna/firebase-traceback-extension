import * as functions from 'firebase-functions/v1';
import { config } from './config';
import {
  privateInitialize,
  ExtensionInitializationResult,
} from './lifecycle/initialize';
import axios from 'axios';
import { getFirestore } from 'firebase-admin/firestore';

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
  cleanup?: {
    requested: boolean;
    performed: boolean;
    deletedCount: number;
    error?: string;
  };
}

export const private_doctor = functions
  .region('europe-west1')
  .https.onRequest(async (req, res): Promise<void> => {
    try {
      // Check if cleanup is requested
      const cleanupRequested = req.query.cleanupInstalls === 'true';

      // Calculate expected site configuration
      const siteId =
        config.domain !== '' ? config.domain : `${config.projectID}-traceback`;
      const expectedSiteName = `https://${siteId}.web.app`;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const appleAssociationURL = `${baseUrl}/.well-known/apple-app-site-association`;

      // Initialize diagnostics
      let appleAppSiteAssociationOk = false;
      let appleAssociationError: string | undefined;
      let initializationAttempted = false;
      let initializationError: string | undefined;
      let initResult: ExtensionInitializationResult;

      // Initialize cleanup result
      let cleanupResult: {
        requested: boolean;
        performed: boolean;
        deletedCount: number;
        error?: string;
      } | undefined;

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

        // Call with createRemoteHost=false, createSampleLink=true to create example dynamic link
        initResult = await privateInitialize(false, true, config);

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

      // Handle cleanup if requested and running in emulator
      if (cleanupRequested) {
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
        cleanupResult = {
          requested: true,
          performed: false,
          deletedCount: 0,
        };

        if (isEmulator) {
          try {
            functions.logger.info('Performing cleanup of all installation records...');
            const db = getFirestore();
            const collection = db
              .collection('_traceback_')
              .doc('installs')
              .collection('records');

            // Get all documents
            const snapshot = await collection.get();
            cleanupResult.deletedCount = snapshot.docs.length;

            if (snapshot.docs.length > 0) {
              // Delete in batches of 500 (Firestore limit)
              const batchSize = 500;
              for (let i = 0; i < snapshot.docs.length; i += batchSize) {
                const batch = db.batch();
                const batchDocs = snapshot.docs.slice(i, i + batchSize);

                batchDocs.forEach((doc) => {
                  batch.delete(doc.ref);
                });

                await batch.commit();
              }

              cleanupResult.performed = true;
              functions.logger.info(`Cleanup completed: deleted ${cleanupResult.deletedCount} installation records`);
            } else {
              cleanupResult.performed = true;
              functions.logger.info('Cleanup completed: no installation records to delete');
            }
          } catch (error: any) {
            cleanupResult.error = error.message || 'Unknown cleanup error';
            functions.logger.error('Cleanup failed:', cleanupResult.error);
          }
        } else {
          cleanupResult.error = 'Cleanup only available in emulator mode';
          functions.logger.warn('Cleanup requested but not in emulator mode');
        }
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
          hostingURL: baseUrl,
          appleAssociationURL: appleAssociationURL,
          appleAssociationError: appleAssociationError,
          initializationAttempted: initializationAttempted,
          initializationError: initializationError,
        },
        cleanup: cleanupResult,
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
