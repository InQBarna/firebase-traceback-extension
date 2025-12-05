import { Request, Response } from 'express';
import * as functions from 'firebase-functions/v1';
import { findDynamicLinkByPath } from '../common/link-lookup';
import {
  trackLinkAnalytics,
  AnalyticsEventType,
} from '../analytics/track-analytics';

/**
 * GET /v1_get_campaign?link=<percent-encoded-url>&first_campaign_open=<true|false>
 *
 * Returns the followLink of a dynamic link campaign based on the path
 * If no link parameter is provided, returns the default campaign (/default)
 * Tracks analytics based on first_campaign_open parameter
 *
 * @param req - Express request with optional query parameter 'link' and optional 'first_campaign_open'
 * @param res - Express response
 *
 * Response:
 * - 200: { result: "https://example.com/follow-link" }
 * - 400: { error: "Invalid URL encoding" | "Invalid URL format" }
 * - 404: { error: "Campaign not found" | "Campaign has no follow link" }
 * - 500: { error: "Internal server error" }
 */
export const private_v1_get_campaign = async function (
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    // Get and decode the link parameter
    const encodedLink = req.query.link as string | undefined;

    // If no link parameter provided, use default campaign path
    let linkPath = '/default';
    let url = new URL('about:blank');

    if (encodedLink) {
      // Decode the URL
      let decodedLink: string;
      try {
        decodedLink = decodeURIComponent(encodedLink);
      } catch (_error) {
        return res.status(400).json({
          error: 'Invalid URL encoding',
        });
      }

      // Parse the URL to extract the path
      try {
        url = new URL(decodedLink);
        linkPath = url.pathname;
      } catch (_error) {
        return res.status(400).json({
          error: 'Invalid URL format',
        });
      }

      // Return 404 if path is just '/'
      if (linkPath === '/' || linkPath === '') {
        return res.status(404).json({
          error: 'Campaign not found',
        });
      }
    }

    // Find the dynamic link by path
    const linkResult = await findDynamicLinkByPath(linkPath);

    if (!linkResult) {
      return res.status(404).json({
        error: 'Campaign not found',
      });
    }

    // Check if followLink exists
    if (!linkResult.data.followLink) {
      return res.status(404).json({
        error: 'Campaign has no follow link',
      });
    }

    // Track analytics based on first_campaign_open parameter
    const firstCampaignOpen = req.query.first_campaign_open as
      | string
      | undefined;
    if (firstCampaignOpen === 'true') {
      await trackLinkAnalytics(
        linkResult.id,
        AnalyticsEventType.APP_FIRST_OPEN_INTENT,
      );
    } else if (firstCampaignOpen === 'false') {
      await trackLinkAnalytics(linkResult.id, AnalyticsEventType.APP_REOPEN);
    }
    // If parameter is not provided or invalid, no analytics are tracked

    // Return the followLink
    // Copy UTM parameters from the current request to the followLink
    const followLinkUrl: URL = new URL(linkResult.data.followLink);
    for (const [key, value] of url.searchParams.entries()) {
      if (key.startsWith('utm_')) {
        followLinkUrl.searchParams.set(key, value);
      }
    }
    return res.status(200).json({
      result: followLinkUrl,
    });
  } catch (error) {
    functions.logger.error('Error in v1_get_campaign:', error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
};
