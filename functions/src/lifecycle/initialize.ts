import axios from 'axios';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { Config } from '../config';
import { getSampleLink } from '../common/sample-links';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
  APIKEYS_DOC,
} from '../common/constants';
import { v4 as uuidv4 } from 'uuid';

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
  functions.logger.info('[INIT] Starting extension initialization', {
    createRemoteHost,
    projectId: config.projectID,
    location: config.location,
  });

  const { FirebaseService } = await import('../firebase-service');

  // Initialize Firebase Service
  functions.logger.info('[INIT] Initializing Firebase Service');
  const firebaseService = new FirebaseService();
  await firebaseService.init(config);
  const siteID = await firebaseService.getSiteId();
  const siteName = `https://${siteID}.web.app`;
  functions.logger.info('[INIT] Firebase Service initialized', {
    siteID,
    siteName,
  });

  if (createRemoteHost) {
    // Create a new website
    functions.logger.info('[INIT] Creating new hosting site');
    const siteResult = await firebaseService.createNewWebsite();
    functions.logger.info('[INIT] Hosting site creation result', {
      alreadyConfigured: siteResult.alreadyConfigured,
      siteId: siteResult.siteId,
    });
    if (siteResult.alreadyConfigured) {
      functions.logger.info(
        '[INIT] Site already configured, skipping setup but still creating sample data',
      );

      // Still create sample data even if site exists
      await createSamples(siteID);

      return {
        siteAlreadyExisted: true,
        siteCreatedViaAPI: false,
        siteName: siteName,
        error: undefined,
      } as ExtensionInitializationResult;
    }

    // Specify website config
    functions.logger.info('[INIT] Configuring hosting rewrites');
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
    functions.logger.info('[INIT] Creating new hosting version');
    const versionID = await firebaseService.createNewVersion(
      siteResult.siteId,
      configPayload,
    );
    functions.logger.info('[INIT] Hosting version created', { versionID });

    if (versionID === undefined) {
      functions.logger.warn(
        '[INIT] Could not create hosting version, site may already exist',
      );

      // Still create sample data even if hosting version creation failed
      await createSamples(siteID);

      return {
        siteAlreadyExisted: true,
        siteCreatedViaAPI: false,
        siteName: siteName,
        error:
          'Could not create a new site version via api, this usually means site already created',
      } as ExtensionInitializationResult;
    }

    // Finalize version
    functions.logger.info('[INIT] Finalizing hosting version');
    await firebaseService.finalizeVersion(siteID, versionID);

    // Deploy to hosting
    functions.logger.info('[INIT] Deploying hosting version');
    await firebaseService.deployVersion(siteID, versionID);

    // Create sample data (dynamic link and API key)
    await createSamples(siteID);
  }

  if (createRemoteHost) {
    // Cold start the instance
    functions.logger.info('[INIT] Cold starting the instance');
    try {
      await axios.get(`https://${siteID}.web.app/example`);
      functions.logger.info('[INIT] Cold start request completed');
    } catch (error) {
      functions.logger.warn('[INIT] Cold start request failed:', error);
    }

    functions.logger.info(
      '[INIT] Extension initialization completed successfully',
    );
    return {
      siteAlreadyExisted: false,
      siteCreatedViaAPI: true,
      siteName: siteName,
      error: undefined,
    } as ExtensionInitializationResult;
  } else {
    functions.logger.info(
      '[INIT] Extension initialization completed (no remote host)',
    );
    return {
      siteAlreadyExisted: false,
      siteCreatedViaAPI: false,
      siteName: siteName,
      error: undefined,
    } as ExtensionInitializationResult;
  }
};

/**
 * Creates sample data (dynamic link and API key) during extension initialization/update
 * Only creates if the respective data doesn't already exist
 */
async function createSamples(siteId: string): Promise<void> {
  functions.logger.info('[INIT:SAMPLES] Creating sample data');

  // Create sample dynamic link if needed
  await createSampleDynamicLink(siteId);

  // Create default API key if needed
  await createSampleAPIKey();

  functions.logger.info('[INIT:SAMPLES] Sample data creation completed');
}

/**
 * Creates a sample dynamic link during extension initialization/update
 * Only creates if no dynamic links exist in the database
 * This helps users understand how to create and use dynamic links
 */
async function createSampleDynamicLink(siteId: string): Promise<void> {
  functions.logger.info('[INIT:SAMPLE_LINK] Starting sample link creation', {
    siteId,
  });

  try {
    const db = admin.firestore();
    const collection = db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION);

    functions.logger.info(
      '[INIT:SAMPLE_LINK] Checking if any dynamic links exist',
    );

    // Check if ANY dynamic links exist
    const anyLinksQuery = await collection.limit(1).get();

    if (!anyLinksQuery.empty) {
      functions.logger.info(
        '[INIT:SAMPLE_LINK] Dynamic links already exist, skipping sample link creation',
        {
          existingLinksCount: anyLinksQuery.size,
        },
      );
      return;
    }

    functions.logger.info(
      '[INIT:SAMPLE_LINK] No dynamic links found, creating sample link',
    );

    const sampleLink = getSampleLink(siteId);
    functions.logger.info('[INIT:SAMPLE_LINK] Sample link data prepared', {
      path: sampleLink.path,
      title: sampleLink.title,
    });

    // Create new sample link
    const docRef = await collection.add({
      ...sampleLink,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    functions.logger.info(
      '[INIT:SAMPLE_LINK] Successfully created new sample dynamic link',
      {
        docId: docRef.id,
        path: '/example',
      },
    );
  } catch (error) {
    // Log error but don't fail the initialization
    functions.logger.error(
      '[INIT:SAMPLE_LINK] Failed to create sample dynamic link',
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    );
  }
}

/**
 * Creates a default API key during extension initialization/update
 * Only creates if no API keys exist in the database
 * This API key is used to secure access to debug endpoints
 */
async function createSampleAPIKey(): Promise<void> {
  functions.logger.info('[INIT:API_KEY] Starting API key creation');

  try {
    const db = admin.firestore();
    const collection = db
      .collection(TRACEBACK_COLLECTION)
      .doc(APIKEYS_DOC)
      .collection(RECORDS_COLLECTION);

    functions.logger.info('[INIT:API_KEY] Checking if any API keys exist');

    // Check if ANY API keys exist
    const anyKeysQuery = await collection.limit(1).get();

    if (!anyKeysQuery.empty) {
      functions.logger.info(
        '[INIT:API_KEY] API keys already exist, skipping API key creation',
        {
          existingKeysCount: anyKeysQuery.size,
        },
      );
      return;
    }

    functions.logger.info(
      '[INIT:API_KEY] No API keys found, creating default API key',
    );

    // Generate random API key using UUID v4
    const apiKeyValue = uuidv4();
    functions.logger.info('[INIT:API_KEY] API key value generated', {
      keyLength: apiKeyValue.length,
    });

    const docRef = await collection.add({
      value: apiKeyValue,
      description:
        'This is the default api key created on install, use to reach endpoints v1_doctor, v1_campaigns, v1_campaign_debug',
      createdAt: admin.firestore.Timestamp.now(),
    });

    functions.logger.info(
      '[INIT:API_KEY] Successfully created default API key',
      {
        docId: docRef.id,
        apiKey: apiKeyValue,
      },
    );
  } catch (error) {
    // Log error but don't fail the initialization
    functions.logger.error('[INIT:API_KEY] Failed to create sample API key', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
