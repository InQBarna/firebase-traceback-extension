import { Request, Response } from 'express';
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
} from '../common/constants';
import DynamicLink from '../types';

interface CampaignDebugItem {
  id: string;
  path: string;
  title?: string;
  description?: string;
  followLink?: string;
}

/**
 * GET /v1_campaigns
 *
 * Returns all dynamic links in the database as JSON
 * Each link includes the full URL to open the campaign
 *
 * @param req - Express request
 * @param res - Express response
 *
 * Response:
 * - 200: { campaigns: CampaignDebugItem[] }
 * - 500: { error: "Internal server error" }
 */
export const private_v1_campaigns = async function (
  _req: Request,
  res: Response,
): Promise<Response> {
  try {
    const db = admin.firestore();

    // Get all dynamic links
    const linksSnapshot = await db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION)
      .get();

    const campaigns: CampaignDebugItem[] = linksSnapshot.docs.map((doc) => {
      const data = doc.data() as DynamicLink;

      return {
        id: doc.id,
        path: data.path,
        title: data.title,
        description: data.description,
        followLink: data.followLink,
      };
    });

    return res.status(200).json({
      campaigns: campaigns,
    });
  } catch (error) {
    functions.logger.error('Error in v1_campaigns:', error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
};

/**
 * GET /v1_campaign_debug
 *
 * Returns an HTML page displaying all dynamic links for QA testing
 * Mobile responsive with tappable campaign links
 *
 * @param req - Express request
 * @param res - Express response
 *
 * Response:
 * - 200: HTML page with campaign list
 * - 500: HTML error page
 */
export const private_v1_campaign_debug = async function (
  _req: Request,
  res: Response,
): Promise<Response> {
  try {
    const db = admin.firestore();

    // Get all dynamic links
    const linksSnapshot = await db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION)
      .get();

    const campaigns: CampaignDebugItem[] = linksSnapshot.docs.map((doc) => {
      const data = doc.data() as DynamicLink;

      return {
        id: doc.id,
        path: data.path,
        title: data.title,
        description: data.description,
        followLink: data.followLink,
      };
    });

    // Generate campaign list HTML - URL is resolved on client side
    const campaignListHTML = campaigns
      .map(
        (campaign) => `
      <a href="${campaign.path}" class="campaign-item">
        <div class="campaign-title">${campaign.title || 'Untitled Campaign'}</div>
        <div class="campaign-path">${campaign.path}</div>
        ${campaign.description ? `<div class="campaign-description">${campaign.description}</div>` : ''}
        ${campaign.followLink ? `<div class="campaign-follow">→ ${campaign.followLink}</div>` : ''}
      </a>
    `,
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Campaign Debug - Dynamic Links</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f5f5f5;
      padding: 16px;
      line-height: 1.5;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 8px;
    }

    .count {
      color: #666;
      font-size: 14px;
    }

    .campaign-item {
      display: block;
      background: white;
      padding: 16px;
      margin-bottom: 12px;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: all 0.2s ease;
    }

    .campaign-item:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateY(-2px);
    }

    .campaign-item:active {
      transform: translateY(0);
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .campaign-title {
      font-size: 18px;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }

    .campaign-path {
      font-size: 14px;
      color: #007AFF;
      font-family: 'Courier New', monospace;
      margin-bottom: 8px;
    }

    .campaign-description {
      font-size: 14px;
      color: #666;
      margin-bottom: 8px;
    }

    .campaign-follow {
      font-size: 12px;
      color: #999;
      font-family: 'Courier New', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty-state {
      background: white;
      padding: 40px 20px;
      border-radius: 8px;
      text-align: center;
      color: #999;
    }

    @media (max-width: 640px) {
      body {
        padding: 12px;
      }

      header {
        padding: 16px;
      }

      h1 {
        font-size: 20px;
      }

      .campaign-item {
        padding: 14px;
      }

      .campaign-title {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Campaign Debug</h1>
      <div class="count">${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} available</div>
    </header>

    ${
      campaigns.length > 0
        ? campaignListHTML
        : '<div class="empty-state">No campaigns found. Create some dynamic links to get started.</div>'
    }
  </div>
</body>
</html>
    `;

    return res.status(200).type('html').send(html);
  } catch (error) {
    functions.logger.error('Error in v1_campaign_debug:', error);
    const errorHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Campaign Debug</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
      padding: 16px;
    }
    .error {
      background: white;
      padding: 32px;
      border-radius: 8px;
      text-align: center;
      max-width: 400px;
    }
    h1 {
      color: #d32f2f;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="error">
    <h1>Error</h1>
    <p>Internal server error occurred while loading campaigns.</p>
  </div>
</body>
</html>
    `;
    return res.status(500).type('html').send(errorHTML);
  }
};
