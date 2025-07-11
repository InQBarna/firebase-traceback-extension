import * as functions from 'firebase-functions/v1';
import { config } from './config';
import {
  privateInitialize,
  ExtensionInitializationResult,
} from './lifecycle/initialize';
import axios from 'axios';
import { AppleAppSizeAssociationDTO } from './wellknown/ios';

export interface DoctorResult {
  extensionInitialization: ExtensionInitializationResult;
  appleAppSizeAssociationOk: boolean;
}

export const private_doctor = functions
  .region('europe-west1')
  .https.onRequest(async (req, res): Promise<void> => {
    try {
      const initResult = await privateInitialize(true, true, config);
      const baseUrl = `${req.protocol}://${req.get('host')}}`;
      let appleAppSiteAssociationOk: boolean
      try {
        const getUrl = `${baseUrl}/.well-known/apple-app-site-association`;
        console.log(getUrl);
        const appleSiteAssociation = (await axios.get(
          getUrl,
        )) as AppleAppSizeAssociationDTO;
        appleAppSiteAssociationOk = appleSiteAssociation.applinks.length > 0;
      } catch {
        appleAppSiteAssociationOk = false;
      }
      res.status(200).send({
        extensionInitialization: initResult,
        appleAppSizeAssociationOk: appleAppSiteAssociationOk,
      } as DoctorResult);
    } catch (error) {
      const errorMessage = error === Error ? (error as Error).message : error;
      functions.logger.error('Initialization error:', errorMessage);
      res.status(500).send('Internal Server Error');
    }
  });
