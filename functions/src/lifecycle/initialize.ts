import axios from 'axios';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { Config } from '../config';
import DynamicLink from '../types';
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
  sampleFollowLink?: string,
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
  }

  // Add a sample dynamic link if sampleFollowLink is provided
  if (sampleFollowLink !== undefined) {
    // Initialize Firestore
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

    if (!existingLinkQuery.empty) {
      // Update existing link with followLink
      const docRef = existingLinkQuery.docs[0].ref;
      await docRef.update({ followLink: sampleFollowLink });
      functions.logger.info(
        `Updated existing sample link at /example with followLink: ${sampleFollowLink}`,
      );
    } else {
      // Create new sample link
      const sampleLink: DynamicLink = {
        path: '/example',
        title: 'Example of dynamic link',
        description: 'This is a sample link!',
        image: `https://${siteID}.web.app/images/thumb.jpg`,
        followLink: sampleFollowLink,
      };
      await collection.add(sampleLink);
      functions.logger.info('Created new sample link at /example');
    }
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
