import axios from 'axios';
import * as admin from 'firebase-admin';
import { Config } from '../config';
import DynamicLink from '../types';

export interface ExtensionInitializationResult {
  siteAlreadyExisted: boolean;
  siteCreatedViaAPI: boolean;
  siteName: string;
  error: string | undefined;
}

export const privateInitialize = async function (
  createRemoteHost: boolean,
  createSampleLink: boolean,
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
  }

  // Add a sample dynamic link
  if (createSampleLink) {
    // Initialize Firestore
    const db = admin.firestore();
    const collection = db
      .collection('_traceback_')
      .doc('dynamiclinks')
      .collection('records');

    // Add a sample dynamic link
    const sampleLink: DynamicLink = {
      path: '/example',
      title: 'Example of dynamic link',
      description: 'This is a sample link!',
      image: `https://${siteID}.web.app/images/thumb.jpg`,
      followLink: '',
    };
    await collection.add(sampleLink);
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
