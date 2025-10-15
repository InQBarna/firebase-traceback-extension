/**
 * Firestore collection names used throughout the extension
 */

// Root collection for all traceback data
export const TRACEBACK_COLLECTION = '_traceback_';

// Document IDs within the traceback collection
export const DYNAMICLINKS_DOC = 'dynamiclinks';
export const INSTALLS_DOC = 'installs';
export const APIKEYS_DOC = 'apikeys';

// Sub-collections
export const RECORDS_COLLECTION = 'records';
export const ANALYTICS_COLLECTION = 'analytics';
export const ATTRIBUTED_COLLECTION = 'attributed';

// API Key header name
export const API_KEY_HEADER = 'x-traceback-api-key';
