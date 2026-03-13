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
import { FirebaseService } from '../firebase-service';

export interface SamplesCreated {
  dynamicLinkSampleAlreadyExisted: boolean;
  dynamicLinkCreated: boolean;
  apiKeyAlreadyExisted: boolean;
  apiKeyCreated: boolean;
}

export interface ExtensionInitializationResult {
  siteAlreadyExisted: boolean;
  siteCreatedViaAPI: boolean;
  siteName: string;
  error: string | undefined;
  samples?: SamplesCreated;
}

interface HostingSetupResult {
  siteAlreadyExisted: boolean;
  success: boolean;
  error?: string;
}

export const privateInitialize = async function (
  createRemoteHost: boolean,
  config: Config,
  createSetupData: boolean = true,
): Promise<ExtensionInitializationResult> {
  let siteName = '';

  try {
    functions.logger.info('[INIT] Starting extension initialization', {
      createRemoteHost,
      createSetupData,
      projectId: config.projectID,
      location: config.location,
    });

    const { FirebaseService } = await import('../firebase-service');

    // Initialize Firebase Service
    functions.logger.info('[INIT] Initializing Firebase Service Client');
    const firebaseService = new FirebaseService();
    await firebaseService.init(config);
    const hostingSiteID = await firebaseService.getHostingSiteId();
    siteName = `https://${hostingSiteID}.web.app`;
    functions.logger.info('[INIT] Firebase Service Client initialized', {
      siteID: hostingSiteID,
      siteName,
    });

    let siteAlreadyExisted = false;
    let samplesCreated: SamplesCreated | undefined;

    if (createRemoteHost) {
      // Setup hosting and endpoints
      const setupResult = await setupHostingAndStaticResources(
        firebaseService,
        config,
        hostingSiteID,
      );
      siteAlreadyExisted = setupResult.siteAlreadyExisted;

      // Create sample data if requested
      if (createSetupData) {
        samplesCreated = await createSamples();
      }

      // If setup failed, return early
      if (!setupResult.success) {
        return {
          siteAlreadyExisted: setupResult.siteAlreadyExisted,
          siteCreatedViaAPI: false,
          siteName: siteName,
          error: setupResult.error,
          samples: samplesCreated,
        } as ExtensionInitializationResult;
      }

      // Cold start the instance
      await coldStart(hostingSiteID);

      functions.logger.info(
        '[INIT] Extension initialization completed successfully',
      );
      return {
        siteAlreadyExisted: siteAlreadyExisted,
        siteCreatedViaAPI: !siteAlreadyExisted,
        siteName: siteName,
        error: undefined,
        samples: samplesCreated,
      } as ExtensionInitializationResult;
    } else {
      functions.logger.info(
        '[INIT] Extension initialization completed (no remote host - read-only check)',
      );

      let siteExists = false;
      const siteResult = await firebaseService.checkWebsiteExists();
      siteExists = siteResult?.alreadyConfigured ?? false;
      functions.logger.info(
        '[INIT] Site existence check (' + hostingSiteID + ')',
        { siteExists },
      );

      return {
        siteAlreadyExisted: siteExists,
        siteCreatedViaAPI: false,
        siteName: siteName,
        error: undefined,
      } as ExtensionInitializationResult;
    }
  } catch (initializeError) {
    functions.logger.error('[INIT] Unexpected initialization failure', {
      error:
        initializeError instanceof Error
          ? initializeError.message
          : String(initializeError),
      stack:
        initializeError instanceof Error ? initializeError.stack : undefined,
    });

    // Return error result
    return {
      siteAlreadyExisted: false,
      siteCreatedViaAPI: false,
      siteName: siteName,
      error:
        initializeError instanceof Error
          ? initializeError.message
          : String(initializeError),
    } as ExtensionInitializationResult;
  }
};

/**
 * Setup hosting site and configure endpoints
 */
async function setupHostingAndStaticResources(
  firebaseService: FirebaseService,
  config: Config,
  siteID: string,
): Promise<HostingSetupResult> {
  // Create a new website
  functions.logger.info('[INIT] Creating/checking new hosting site: ' + siteID);
  const siteResult = await firebaseService.createHostingIfNoExisting();
  functions.logger.info('[INIT] Hosting site creation result', {
    alreadyConfigured: siteResult.alreadyConfigured,
    siteId: siteResult.siteId,
  });

  if (siteResult.alreadyConfigured) {
    functions.logger.info('[INIT] Site already configured, skipping setup');
    return {
      siteAlreadyExisted: true,
      success: true,
    };
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
  functions.logger.info('[INIT] Hosting version created ' + versionID);

  if (versionID === undefined) {
    functions.logger.warn(
      '[INIT] Could not create hosting version, site may already exist',
    );
    return {
      siteAlreadyExisted: true,
      success: false,
      error:
        'Could not create a new site version via api, this usually means site already created',
    };
  }

  // Finalize version
  functions.logger.info('[INIT] Finalizing hosting version');
  await firebaseService.finalizeVersion(siteID, versionID);

  // Deploy to hosting
  functions.logger.info('[INIT] Deploying hosting version');
  await firebaseService.deployVersion(siteID, versionID);

  return {
    siteAlreadyExisted: false,
    success: true,
  };
}

/**
 * Cold start the hosting instance to warm it up
 */
async function coldStart(hostingSiteID: string): Promise<void> {
  const endpoint: string = `https://${hostingSiteID}.web.app/example`;
  functions.logger.info(
    '[INIT] Cold starting the instance by calling "' + endpoint + '"',
  );
  try {
    await axios.get(endpoint);
    functions.logger.info('[INIT] Cold start request completed');
  } catch (error) {
    functions.logger.warn('[INIT] Cold start request failed:', error);
  }
}

/**
 * Creates sample data (dynamic link and API key) during extension initialization/update
 * Only creates if the respective data doesn't already exist
 * @returns Object indicating which samples were created and which already existed
 */
async function createSamples(): Promise<SamplesCreated> {
  functions.logger.info('[INIT:SAMPLES] Creating sample data');

  // Create sample dynamic link if needed
  const dynamicLinkResult = await createSampleDynamicLink();

  // Create default API key if needed
  const apiKeyResult = await createSampleAPIKey();

  functions.logger.info('[INIT:SAMPLES] Sample data creation completed', {
    dynamicLinkAlreadyExisted: dynamicLinkResult.alreadyExisted,
    dynamicLinkCreated: dynamicLinkResult.created,
    apiKeyAlreadyExisted: apiKeyResult.alreadyExisted,
    apiKeyCreated: apiKeyResult.created,
  });

  return {
    dynamicLinkSampleAlreadyExisted: dynamicLinkResult.alreadyExisted,
    dynamicLinkCreated: dynamicLinkResult.created,
    apiKeyAlreadyExisted: apiKeyResult.alreadyExisted,
    apiKeyCreated: apiKeyResult.created,
  };
}

/**
 * Creates a sample dynamic link during extension initialization/update
 * Only creates if no dynamic links exist in the database
 * This helps users understand how to create and use dynamic links
 * @returns Object with alreadyExisted and created flags
 */
async function createSampleDynamicLink(): Promise<{
  alreadyExisted: boolean;
  created: boolean;
}> {
  functions.logger.info('[INIT:SAMPLE_LINK] Starting sample link creation');

  try {
    const db = admin.firestore();
    const collection = db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION);

    // Check if ANY dynamic links exist
    const anyLinksQuery = await collection.limit(1).get();

    if (!anyLinksQuery.empty) {
      functions.logger.info(
        '[INIT:SAMPLE_LINK] Dynamic links already exist, skipping',
      );
      return { alreadyExisted: true, created: false };
    }

    const sampleLink = getSampleLink();

    // Create new sample link
    const docRef = await collection.add({
      ...sampleLink,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    functions.logger.info('[INIT:SAMPLE_LINK] Created sample dynamic link', {
      docId: docRef.id,
      path: sampleLink.path,
    });

    return { alreadyExisted: false, created: true };
  } catch (error) {
    // Log error but don't fail the initialization
    functions.logger.error(
      '[INIT:SAMPLE_LINK] Failed to create sample dynamic link',
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    );
    return { alreadyExisted: false, created: false };
  }
}

/**
 * Creates a default API key during extension initialization/update
 * Only creates if no API keys exist in the database
 * This API key is used to secure access to debug endpoints
 * @returns Object with alreadyExisted and created flags
 */
async function createSampleAPIKey(): Promise<{
  alreadyExisted: boolean;
  created: boolean;
}> {
  functions.logger.info('[INIT:API_KEY] Starting API key creation');

  try {
    const db = admin.firestore();
    const collection = db
      .collection(TRACEBACK_COLLECTION)
      .doc(APIKEYS_DOC)
      .collection(RECORDS_COLLECTION);

    // Check if ANY API keys exist
    const anyKeysQuery = await collection.limit(1).get();

    if (!anyKeysQuery.empty) {
      functions.logger.info('[INIT:API_KEY] API keys already exist, skipping');
      return { alreadyExisted: true, created: false };
    }

    // Generate random API key using UUID v4
    const apiKeyValue = uuidv4();

    const docRef = await collection.add({
      value: apiKeyValue,
      description:
        'This is the default api key created on install, use to reach endpoints v1_doctor, v1_campaigns, v1_campaign_debug',
      createdAt: admin.firestore.Timestamp.now(),
    });

    functions.logger.info('[INIT:API_KEY] Created default API key', {
      docId: docRef.id,
      apiKey: apiKeyValue,
    });

    return { alreadyExisted: false, created: true };
  } catch (error) {
    // Log error but don't fail the initialization
    functions.logger.error('[INIT:API_KEY] Failed to create sample API key', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { alreadyExisted: false, created: false };
  }
}
