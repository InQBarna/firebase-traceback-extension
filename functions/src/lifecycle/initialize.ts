import axios from 'axios';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { Config } from '../config';
import { getSampleLink } from '../common/sample-links';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
} from '../common/constants';

export interface ExtensionInitializationResult {
  siteAlreadyExisted: boolean;
  siteCreatedViaAPI: boolean;
  siteName: string;
  error: string | undefined;
}

export const privateInitialize = async function (
  createRemoteHost: boolean,
  config: Config,
): Promise<ExtensionInitializationResult> {
  const { FirebaseService } = await import('../firebase-service');

  // Initialize Firebase Service
  const firebaseService = new FirebaseService();
  await firebaseService.init(config);
  const siteID = await firebaseService.getSiteId();
  const siteName = `https://${siteID}.web.app`;

  if (createRemoteHost) {
    // Create a new website
    const siteResult = await firebaseService.createNewWebsite();
    if (siteResult.alreadyConfigured) {
      return {
        siteAlreadyExisted: true,
        siteCreatedViaAPI: false,
        siteName: siteName,
        error: undefined,
      } as ExtensionInitializationResult;
    }

    // Specify website config
    const configPayload = {
      config: {
        appAssociation: 'NONE',
        rewrites: [
          {
            glob: '**',
            function: `ext-${config.extensionID}-dynamichostingcontent`,
            functionRegion: config.location,
          },
        ],
      },
    };

    // Get the new version ID
    const versionID = await firebaseService.createNewVersion(
      siteResult.siteId,
      configPayload,
    );

    if (versionID === undefined) {
      return {
        siteAlreadyExisted: true,
        siteCreatedViaAPI: false,
        siteName: siteName,
        error:
          'Could not create a new site version via api, this usually means site already created',
      } as ExtensionInitializationResult;
    }

    // Finalize version
    await firebaseService.finalizeVersion(siteID, versionID);

    // Deploy to hosting
    await firebaseService.deployVersion(siteID, versionID);

    // Create a sample dynamic link to help users understand how to use the extension
    await createSampleDynamicLink(siteID);
  }

  if (createRemoteHost) {
    // Cold start the instance
    await axios.get(`https://${siteID}.web.app/example`);
    return {
      siteAlreadyExisted: false,
      siteCreatedViaAPI: true,
      siteName: siteName,
      error: undefined,
    } as ExtensionInitializationResult;
  } else {
    return {
      siteAlreadyExisted: false,
      siteCreatedViaAPI: false,
      siteName: siteName,
      error: undefined,
    } as ExtensionInitializationResult;
  }
};

/**
 * Creates a sample dynamic link during extension initialization
 * This helps users understand how to create and use dynamic links
 */
async function createSampleDynamicLink(siteId: string): Promise<void> {
  try {
    const db = admin.firestore();
    const collection = db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION);

    // Check if sample link already exists
    const existingLinkQuery = await collection
      .where('path', '==', '/example')
      .limit(1)
      .get();

    const sampleLink = getSampleLink(siteId);

    if (!existingLinkQuery.empty) {
      // Update existing sample link
      const docRef = existingLinkQuery.docs[0].ref;
      await docRef.update({
        ...sampleLink,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      functions.logger.info('Updated existing sample dynamic link at /example');
    } else {
      // Create new sample link
      await collection.add({
        ...sampleLink,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      functions.logger.info('Created new sample dynamic link at /example');
    }
  } catch (error) {
    // Log error but don't fail the initialization
    functions.logger.warn('Failed to create sample dynamic link:', error);
  }
}
