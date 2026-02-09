import { Request, Response } from 'express';
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as Joi from 'joi';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
} from '../common/constants';
import { config } from '../config';
import { getSiteName } from '../common/site-utils';

const createCampaignSchema = Joi.object({
  path: Joi.string().required().pattern(/^\//).invalid('/').messages({
    'any.required': 'path is required',
    'string.pattern.base': 'path must start with /',
    'any.invalid': 'path must not be just "/"',
  }),
  title: Joi.string().optional(),
  description: Joi.string().optional(),
  image: Joi.string().uri().optional(),
  followLink: Joi.string().uri().optional(),
  expires: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'expires must be a valid ISO 8601 date string',
  }),
  appleAffiliateToken: Joi.string().optional(),
  appleCampaignText: Joi.string().optional(),
  appleMediaType: Joi.string().optional(),
  appleProviderId: Joi.string().optional(),
});

/**
 * POST /v1_create_campaign
 *
 * Creates a new campaign link in the database.
 * Requires API key authentication.
 *
 * @param req - Express request with campaign data in body
 * @param res - Express response
 *
 * Response:
 * - 201: Campaign created successfully
 * - 400: Validation error
 * - 409: Duplicate path
 * - 500: Internal server error
 */
export const private_v1_create_campaign = async function (
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    // Validate request body
    const { error, value } = createCampaignSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map((d) => ({
          message: d.message,
          path: d.path,
        })),
      });
    }

    const db = admin.firestore();
    const collection = db
      .collection(TRACEBACK_COLLECTION)
      .doc(DYNAMICLINKS_DOC)
      .collection(RECORDS_COLLECTION);

    // Check for duplicate path
    const existingSnapshot = await collection
      .where('path', '==', value.path)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        error: 'A campaign with this path already exists',
      });
    }

    // Build document data
    const nowTimestamp = Timestamp.now();
    const docData: Record<string, unknown> = {
      path: value.path,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    };

    // Add optional fields if provided
    if (value.title !== undefined) docData.title = value.title;
    if (value.description !== undefined)
      docData.description = value.description;
    if (value.image !== undefined) docData.image = value.image;
    if (value.followLink !== undefined) docData.followLink = value.followLink;
    if (value.appleAffiliateToken !== undefined)
      docData.appleAffiliateToken = value.appleAffiliateToken;
    if (value.appleCampaignText !== undefined)
      docData.appleCampaignText = value.appleCampaignText;
    if (value.appleMediaType !== undefined)
      docData.appleMediaType = value.appleMediaType;
    if (value.appleProviderId !== undefined)
      docData.appleProviderId = value.appleProviderId;

    // Convert expires ISO string to Firestore Timestamp
    if (value.expires) {
      docData.expires = Timestamp.fromDate(new Date(value.expires));
    }

    // Create the document
    const docRef = await collection.add(docData);

    // Build response
    const response: Record<string, unknown> = {
      id: docRef.id,
      path: value.path,
    };

    if (value.title !== undefined) response.title = value.title;
    if (value.description !== undefined)
      response.description = value.description;
    if (value.image !== undefined) response.image = value.image;
    if (value.followLink !== undefined) response.followLink = value.followLink;
    if (value.expires !== undefined) response.expires = value.expires;
    if (value.appleAffiliateToken !== undefined)
      response.appleAffiliateToken = value.appleAffiliateToken;
    if (value.appleCampaignText !== undefined)
      response.appleCampaignText = value.appleCampaignText;
    if (value.appleMediaType !== undefined)
      response.appleMediaType = value.appleMediaType;
    if (value.appleProviderId !== undefined)
      response.appleProviderId = value.appleProviderId;

    response.campaignUrl = `${getSiteName(config)}${value.path}`;
    response.createdAt = nowTimestamp.toDate().toISOString();
    response.updatedAt = nowTimestamp.toDate().toISOString();

    return res.status(201).json(response);
  } catch (error) {
    functions.logger.error('Error in v1_create_campaign:', error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
};
