import axios from 'axios';
import * as admin from 'firebase-admin';
import { Config } from '../config';
import DynamicLink from '../types';

export const privateInitialize = async function (
    createRemoteHost: boolean,
    createSampleLink: boolean,
    config: Config
): Promise<undefined> {
  const { FirebaseService } = await import('../firebase-service');

  // Initialize Firebase Service
  const firebaseService = new FirebaseService();
  await firebaseService.init(config);
  const siteID = await firebaseService.getSiteId();

  if (createRemoteHost) {
    // Create a new website
    const siteResult = await firebaseService.createNewWebsite();
    if (siteResult.alreadyConfigured) {
      return
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
      return;
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
    const collection = db.collection('_traceback_');

    // Add a sample dynamic link
    let sampleLink: DynamicLink = {
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
  }
}