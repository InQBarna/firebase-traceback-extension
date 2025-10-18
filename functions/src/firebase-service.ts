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

  public getSiteId(): string {
    return getSiteId(this.privateConfig);
  }

  // Create new Hosting website
  public async createNewWebsite(): Promise<CreateSite> {
    const siteID = this.getSiteId();
    try {
      const url = `https://${siteID}.web.app/.well-known/apple-app-site-association`;
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
          siteId: siteID,
        };
      }
    } catch (_error) {
      // Nice, continue
    }

    try {
      const getUrl = `${this.firebaseHostingURL}/projects/${this.privateConfig.projectID}/sites/${siteID}`;
      await axios.get(getUrl, { headers: this.jsonHeaders });
      return {
        alreadyCreated: true,
        alreadyConfigured: false,
        siteId: siteID,
      };
    } catch {
      // Nice, continue
    }

    try {
      const postUrl = `${this.firebaseHostingURL}/projects/${this.privateConfig.projectID}/sites?siteId=${siteID}`;
      await axios.post(postUrl, {}, { headers: this.jsonHeaders });
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 409) {
          // Site already exists (409 Conflict)
          return {
            alreadyCreated: true,
            alreadyConfigured: false,
            siteId: siteID,
          };
        }
        // Any other error (e.g., 400, 403) likely means domain is already taken or invalid
        // Treat as already existing to allow initialization to continue
        logger.warn(
          `[FIREBASE_SERVICE] Site creation failed with status ${error.response?.status}, treating as already existing`,
          {
            status: error.response?.status,
            statusText: error.response?.statusText,
            siteID,
          },
        );
        return {
          alreadyCreated: true,
          alreadyConfigured: false,
          siteId: siteID,
        };
      }
    }
    return {
      alreadyCreated: true,
      alreadyConfigured: false,
      siteId: siteID,
    };
  }

  // Create new Hosting website version
  public async createNewVersion(
    siteID: string,
    config: any,
  ): Promise<string | undefined> {
    try {
      const getUrl = `${this.firebaseHostingURL}/sites/${siteID}/versions`;
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

    const url = `${this.firebaseHostingURL}/sites/${siteID}/versions`;
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
