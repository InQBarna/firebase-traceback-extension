import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import * as Joi from 'joi';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
  ANALYTICS_COLLECTION,
} from '../common/constants';

const querySchema = Joi.object({
  campaignPath: Joi.string()
    .required()
    .pattern(/^\//)
    .messages({
      'string.pattern.base': 'campaignPath must start with /',
      'any.required': 'campaignPath is required',
    }),
  durationDays: Joi.number().integer().min(1).max(365).default(7),
  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .default(() => new Date().toISOString().split('T')[0])
    .messages({
      'string.pattern.base': 'endDate must be in YYYY-MM-DD format',
    }),
  apiKey: Joi.string().optional(),
});

/**
 * GET /v1_campaign_analytics
 *
 * Returns per-day analytics for a campaign link.
 * Requires API key authentication.
 *
 * Query params:
 * - campaignPath (required): The campaign path (must start with /)
 * - durationDays (optional): Number of days to look back (1-365, default 7)
 * - endDate (optional): End date in YYYY-MM-DD format (default today)
 */
export const private_v1_campaign_analytics = async function (
  req: Request,
  res: Response,
): Promise<Response> {
  // Validate query params
  const { error, value } = querySchema.validate(req.query, {
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      error: 'Invalid parameters',
      message: error.details[0].message,
    });
  }

  const { campaignPath, durationDays, endDate } = value;

  try {
    const db = admin.firestore();

    // Find campaign by path
    const linksSnapshot = await db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION)
      .where('path', '==', campaignPath)
      .limit(1)
      .get();

    if (linksSnapshot.empty) {
      return res.status(404).json({
        error: 'Campaign not found',
        message: `No campaign found with path: ${campaignPath}`,
      });
    }

    const linkDoc = linksSnapshot.docs[0];

    // Compute date range
    const end = new Date(endDate + 'T00:00:00Z');
    const dates: string[] = [];
    for (let i = durationDays - 1; i >= 0; i--) {
      const date = new Date(end);
      date.setUTCDate(date.getUTCDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    const startDate = dates[0];

    // Batch-fetch all analytics docs in a single Firestore round-trip
    const analyticsCollectionRef = linkDoc.ref.collection(ANALYTICS_COLLECTION);
    const docRefs = dates.map((date) => analyticsCollectionRef.doc(date));
    const docs = await db.getAll(...docRefs);

    // Build analytics object, omitting days with no data
    const analytics: Record<string, FirebaseFirestore.DocumentData> = {};
    for (const doc of docs) {
      if (doc.exists) {
        analytics[doc.id] = doc.data()!;
      }
    }

    return res.status(200).json({
      campaignPath,
      durationDays,
      startDate,
      endDate,
      analytics,
    });
  } catch (err) {
    logger.error('Error in v1_campaign_analytics:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
};
