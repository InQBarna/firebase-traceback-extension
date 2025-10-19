import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as path from 'path';

import { config } from './config';
import {
  private_v1_preinstall_save_link,
  private_v1_postinstall_search_link,
} from './installs/installs';
import { apple_app_size_association } from './wellknown/ios';
import { asset_links } from './wellknown/android';
import { link_preview } from './preview/preview';
import { private_doctor } from './doctor';
import { private_retry_initialize } from './retry-initialize';
import { privateInitialize } from './lifecycle/initialize';
import { private_v1_get_campaign } from './campaigns/campaigns';
import {
  private_v1_campaigns,
  private_v1_campaign_debug,
} from './campaigns/campaign-debug';
import { validateApiKey } from './middleware/api-key-auth';
import { getSiteId } from './common/site-utils';

//
// # Lifecycle: initialization
//

// ## Initialize Firebase Admin SDK
admin.initializeApp();

// ## Initializate extension
exports.initialize = functions.tasks.taskQueue().onDispatch(async () => {
  const { getExtensions } = await import('firebase-admin/extensions');
  try {
    const initResult = await privateInitialize(true, config, true);

    // Finalize extension initialization
    await getExtensions()
      .runtime()
      .setProcessingState(
        'PROCESSING_COMPLETE',
        `Initialization is complete ` + (initResult.error ?? ''),
      );
  } catch (error) {
    const errorMessage = error === Error ? (error as Error).message : error;
    functions.logger.error('Initialization error:', errorMessage);

    await getExtensions()
      .runtime()
      .setProcessingState(
        'PROCESSING_FAILED',
        `Initialization failed. ${errorMessage}`,
      );
  }
});

// # Initialize Express app
const app = express();

//
// # Post install cloud function endpoint
//

app.post('/v1_postinstall_search_link', private_v1_postinstall_search_link);

//
// # Dynamic content served from hosting and pre-install
//

// ## Set up Firebase Cloud Functions
exports.dynamichostingcontent = functions.https.onRequest(app);

// ## Error-handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    functions.logger.error('Error:', err);
    res.status(500).send('Internal Server Error');
  },
);

// ## iOS Association
app.use('/.well-known/apple-app-site-association', async (req, res) => {
  await apple_app_size_association(
    req,
    res,
    config.iosTeamID,
    config.iosBundleID,
  );
});

// ## Android Association
app.use('/.well-known/assetlinks.json', async (req, res) => {
  // TODO: sha optional ??
  await asset_links(req, res, config.androidBundleID, config.androidSHA ?? '');
});

// ## Host assets dynamic to bundle assets
app.use('/images', express.static(path.join(__dirname, './assets/images')));

// ## Log device installs / heuristics when opening the app in browser (pre-install)
app.post('/v1_preinstall_save_link', private_v1_preinstall_save_link);

// ## Doctor endpoint (secured with API key)
app.get('/v1_doctor', validateApiKey, private_doctor);

// ## Retry initialization endpoint (secured with API key)
app.post('/v1_retry_initialize', validateApiKey, private_retry_initialize);

// ## Get campaign endpoint
app.get('/v1_get_campaign', private_v1_get_campaign);

// ## Campaign listing (JSON, secured with API key)
app.get('/v1_campaigns', validateApiKey, private_v1_campaigns);

// ## Campaign debug (HTML for QA, secured with API key)
app.get('/v1_campaign_debug', validateApiKey, private_v1_campaign_debug);

// ## Handle all other routes
app.use('*', async (req, res) => {
  try {
    return await link_preview(req, res, getSiteId(config), config);
  } catch (error) {
    functions.logger.error('Error when opening link preview: ', error);
    return res.status(500).send('Internal Server Error');
  }
});
