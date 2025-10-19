import axios, { isAxiosError } from 'axios';
import { logger } from 'firebase-functions';

import { GoogleAuth } from 'google-auth-library';

import { Config, config } from './config';
import { getSiteId } from './common/site-utils';

export interface CreateSite {
  alreadyCreated: boolean;
  alreadyConfigured: boolean;
  siteId: string;
}
export interface VersionsResponse {
  versions: Version[];
  nextPageToken: string;
}

export interface Version {
  name: string;
  status: VersionStatus;
}

export enum VersionStatus {
  VERSION_STATUS_UNSPECIFIED = 'VERSION_STATUS_UNSPECIFIED',
  CREATED = 'CREATED',
  FINALIZED = 'FINALIZED',
  DELETED = 'DELETED',
  ABANDONED = 'ABANDONED',
  EXPIRED = 'EXPIRED',
  CLONING = 'CLONING',
}

// Handles Firebase-associated REST API requests
export class FirebaseService {
  private readonly firebaseHostingURL =
    'https://firebasehosting.googleapis.com/v1beta1';

  private accessToken: string | undefined;

  private privateConfig: Config = config;

  // Get common JSON headers
  private get jsonHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  // Initialize service
  public async init(config: Config) {
    // Get access token for REST API
    try {
      this.privateConfig = config;
      await this.getAccessToken();
    } catch (_error) {
      throw Error(
        'Could not get access token. If running test locally try executing gcloud auth "application-default login"',
      );
    }
  }

  // Get Google API access token
  public async getAccessToken() {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/firebase'],
    });

    const authClient = await auth.getClient();
    const accessToken = (await authClient.getAccessToken()).token;

    if (accessToken == null) {
      logger.error('Could not get access token');
      return;
    }

    this.accessToken = accessToken;
  }

  public getHostingSiteId(): string {
    return getSiteId(this.privateConfig);
  }

  // Check if website already exists
  public async checkWebsiteExists(): Promise<CreateSite | null> {
    const hostingSiteID = this.getHostingSiteId();

    // Check if site is already configured via apple-app-site-association
    try {
      const url = `https://${hostingSiteID}.web.app/.well-known/apple-app-site-association`;
      const expected = {
        applinks: {
          apps: [],
          details: [
            {
              appID: `${this.privateConfig.iosTeamID}.${this.privateConfig.iosBundleID}`,
              paths: ['*'],
            },
          ],
        },
        webcredentials: {
          apps: [
            `${this.privateConfig.iosTeamID}.${this.privateConfig.iosBundleID}`,
          ],
        },
      };
      const appSizeAssociationResp = await axios.get(url, {});
      const matches =
        JSON.stringify(appSizeAssociationResp.data) ===
        JSON.stringify(expected);
      if (matches) {
        return {
          alreadyCreated: true,
          alreadyConfigured: true,
          siteId: hostingSiteID,
        };
      }
    } catch (_error) {
      // Site not configured yet, continue checking
    }

    // Check if site exists via API
    try {
      const getUrl = `${this.firebaseHostingURL}/projects/${this.privateConfig.projectID}/sites/${hostingSiteID}`;
      await axios.get(getUrl, { headers: this.jsonHeaders });
      return {
        alreadyCreated: true,
        alreadyConfigured: false,
        siteId: hostingSiteID,
      };
    } catch {
      // Site does not exist
    }

    return null;
  }

  // Create new Hosting website
  public async createHostingIfNoExisting(): Promise<CreateSite> {
    const hostingSiteID = this.getHostingSiteId();

    // Check if site already exists
    const existingWebsite = await this.checkWebsiteExists();
    if (existingWebsite) {
      return existingWebsite;
    }

    try {
      const postUrl = `${this.firebaseHostingURL}/projects/${this.privateConfig.projectID}/sites?siteId=${hostingSiteID}`;
      await axios.post(postUrl, {}, { headers: this.jsonHeaders });
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 409) {
          // Site already exists (409 Conflict)
          return {
            alreadyCreated: true,
            alreadyConfigured: false,
            siteId: hostingSiteID,
          };
        }
        // Any other error (e.g., 400, 403) likely means domain is already taken or invalid
        // Treat as already existing to allow initialization to continue
        logger.warn(
          `[FIREBASE_CLIENT] Site creation failed with status ${error.response?.status}, treating as already existing`,
          {
            status: error.response?.status,
            statusText: error.response?.statusText,
            siteID: hostingSiteID,
          },
        );
        return {
          alreadyCreated: true,
          alreadyConfigured: false,
          siteId: hostingSiteID,
        };
      }
    }
    return {
      alreadyCreated: true,
      alreadyConfigured: false,
      siteId: hostingSiteID,
    };
  }

  // Create new Hosting website version
  public async createNewVersion(
    hostingSiteID: string,
    config: any,
  ): Promise<string | undefined> {
    try {
      const getUrl = `${this.firebaseHostingURL}/sites/${hostingSiteID}/versions`;
      const versionsResult = await axios.get(getUrl, {
        headers: this.jsonHeaders,
      });
      const versionResponse: VersionsResponse =
        versionsResult.data as VersionsResponse;
      const finalizedVersions = versionResponse.versions.filter((version) => {
        return version.status === 'FINALIZED';
      });
      if (finalizedVersions.length > 0) {
        return undefined;
      }
    } catch {
      // Nice, continue...
    }

    const url = `${this.firebaseHostingURL}/sites/${hostingSiteID}/versions`;
    const versionResult = await axios.post(url, config, {
      headers: this.jsonHeaders,
    });

    const versionData = versionResult.data as any;
    const parts = versionData['name'].split('/');

    return parts[parts.length - 1];
  }

  // Finalize new Hosting website version
  public async finalizeVersion(siteID: string, versionID: string) {
    const url = `${this.firebaseHostingURL}/sites/${siteID}/versions/${versionID}?update_mask=status`;

    await axios.patch(
      url,
      { status: 'FINALIZED' },
      { headers: this.jsonHeaders },
    );
  }

  // Deploy new Hosting website
  public async deployVersion(siteID: string, versionID: string) {
    const url = `${this.firebaseHostingURL}/sites/${siteID}/releases?versionName=sites/${siteID}/versions/${versionID}`;

    await axios.post(url, {}, { headers: this.jsonHeaders });
  }
}
