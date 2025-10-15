import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import {
  TRACEBACK_COLLECTION,
  APIKEYS_DOC,
  RECORDS_COLLECTION,
  API_KEY_HEADER,
} from '../common/constants';

/**
 * Middleware to validate API key from request headers
 * API key must be provided in the x-traceback-api-key header
 * and must exist in the _traceback_/apikeys/records collection
 */
export async function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.get(API_KEY_HEADER);

  if (!apiKey) {
    res.status(401).json({
      error: 'API key required',
      message: `Please provide an API key in the ${API_KEY_HEADER} header`,
    });
    return;
  }

  try {
    const db = admin.firestore();
    const apiKeysSnapshot = await db
      .collection(TRACEBACK_COLLECTION)
      .doc(APIKEYS_DOC)
      .collection(RECORDS_COLLECTION)
      .where('value', '==', apiKey)
      .limit(1)
      .get();

    if (apiKeysSnapshot.empty) {
      res.status(403).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid',
      });
      return;
    }

    // API key is valid, continue to the next middleware/handler
    next();
  } catch (error) {
    functions.logger.error('Error validating API key:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to validate API key',
    });
  }
}
