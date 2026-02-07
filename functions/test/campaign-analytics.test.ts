import * as request from 'supertest';
import {
  getTestApiUrl,
  initializeTestFirebase,
  getTestFirestore,
  clearDynamicLinkRecords,
  clearApiKeyRecords,
  cleanupTestFirebase,
  createTestApiKey,
} from './test-utils';
import { createDynamicLink } from './link-helpers';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
  API_KEY_HEADER,
} from '../src/common/constants';

const HOST_BASE_URL = getTestApiUrl();

initializeTestFirebase();

const db = getTestFirestore();

describe('Campaign Analytics API - v1_campaign_analytics', () => {
  jest.setTimeout(30000);

  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createTestApiKey('Campaign analytics test key');
  });

  beforeEach(async () => {
    await clearDynamicLinkRecords();
  });

  afterEach(async () => {
    await clearDynamicLinkRecords();
  });

  afterAll(async () => {
    await clearApiKeyRecords();
    await cleanupTestFirebase();
  });

  describe('Authentication', () => {
    test('should return 401 without API key', async () => {
      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=/summer')
        .expect(401);

      expect(response.body.error).toBe('API key required');
    });

    test('should return 403 with invalid API key', async () => {
      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=/summer')
        .set(API_KEY_HEADER, 'invalid-api-key')
        .expect(403);

      expect(response.body.error).toBe('Invalid API key');
    });

    test('should accept API key via query parameter', async () => {
      await createDynamicLink({
        path: '/query-key-test',
        title: 'Query Key Test',
        followLink: 'https://example.com',
      });

      const response = await request(HOST_BASE_URL)
        .get(`/v1_campaign_analytics?campaignPath=/query-key-test&apiKey=${apiKey}`)
        .expect(200);

      expect(response.body.campaignPath).toBe('/query-key-test');
    });
  });

  describe('Validation', () => {
    test('should return 400 when campaignPath is missing', async () => {
      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics')
        .set(API_KEY_HEADER, apiKey)
        .expect(400);

      expect(response.body.error).toBe('Invalid parameters');
    });

    test('should return 400 when campaignPath does not start with /', async () => {
      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=summer')
        .set(API_KEY_HEADER, apiKey)
        .expect(400);

      expect(response.body.error).toBe('Invalid parameters');
      expect(response.body.message).toContain('campaignPath must start with /');
    });
  });

  describe('Campaign lookup', () => {
    test('should return 404 for non-existent campaign', async () => {
      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=/nonexistent')
        .set(API_KEY_HEADER, apiKey)
        .expect(404);

      expect(response.body.error).toBe('Campaign not found');
    });
  });

  describe('Analytics retrieval', () => {
    test('should return 200 with empty analytics when no analytics docs exist', async () => {
      await createDynamicLink({
        path: '/no-analytics',
        title: 'No Analytics',
        followLink: 'https://example.com',
      });

      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=/no-analytics')
        .set(API_KEY_HEADER, apiKey)
        .expect(200);

      expect(response.body.campaignPath).toBe('/no-analytics');
      expect(response.body.durationDays).toBe(7);
      expect(response.body.analytics).toEqual({});
    });

    test('should return analytics across multiple days', async () => {
      // Create campaign
      const linkId = await createDynamicLink({
        path: '/multi-day',
        title: 'Multi Day',
        followLink: 'https://example.com',
      });

      // Seed analytics for two dates
      const analyticsRef = db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(linkId)
        .collection('analytics');

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      await analyticsRef.doc(today).set({
        open_link_preview: { desktop: 5, android: 3, ios: 2 },
        redirects: { desktop: 1, android: 0, ios: 0 },
        first_opens_intent: { desktop: 0, android: 0, ios: 0 },
        first_opens_install: { desktop: 0, android: 0, ios: 0 },
        reopens: { desktop: 0, android: 0, ios: 0 },
      });

      await analyticsRef.doc(yesterday).set({
        open_link_preview: { desktop: 10, android: 7, ios: 4 },
        redirects: { desktop: 0, android: 1, ios: 3 },
        first_opens_intent: { desktop: 0, android: 1, ios: 2 },
        first_opens_install: { desktop: 0, android: 0, ios: 1 },
        reopens: { desktop: 0, android: 3, ios: 5 },
      });

      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=/multi-day&durationDays=7')
        .set(API_KEY_HEADER, apiKey)
        .expect(200);

      expect(response.body.campaignPath).toBe('/multi-day');
      expect(response.body.analytics[today]).toBeDefined();
      expect(response.body.analytics[today].open_link_preview.desktop).toBe(5);
      expect(response.body.analytics[yesterday]).toBeDefined();
      expect(response.body.analytics[yesterday].open_link_preview.desktop).toBe(10);
    });

    test('should filter data by durationDays (exclude data outside range)', async () => {
      const linkId = await createDynamicLink({
        path: '/range-test',
        title: 'Range Test',
        followLink: 'https://example.com',
      });

      const analyticsRef = db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(linkId)
        .collection('analytics');

      const today = new Date().toISOString().split('T')[0];
      // 10 days ago - outside the 3-day range
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

      await analyticsRef.doc(today).set({
        open_link_preview: { desktop: 1, android: 0, ios: 0 },
        redirects: { desktop: 0, android: 0, ios: 0 },
        first_opens_intent: { desktop: 0, android: 0, ios: 0 },
        first_opens_install: { desktop: 0, android: 0, ios: 0 },
        reopens: { desktop: 0, android: 0, ios: 0 },
      });

      await analyticsRef.doc(tenDaysAgo).set({
        open_link_preview: { desktop: 99, android: 0, ios: 0 },
        redirects: { desktop: 0, android: 0, ios: 0 },
        first_opens_intent: { desktop: 0, android: 0, ios: 0 },
        first_opens_install: { desktop: 0, android: 0, ios: 0 },
        reopens: { desktop: 0, android: 0, ios: 0 },
      });

      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=/range-test&durationDays=3')
        .set(API_KEY_HEADER, apiKey)
        .expect(200);

      expect(response.body.durationDays).toBe(3);
      expect(response.body.analytics[today]).toBeDefined();
      expect(response.body.analytics[today].open_link_preview.desktop).toBe(1);
      // Data from 10 days ago should NOT be included
      expect(response.body.analytics[tenDaysAgo]).toBeUndefined();
    });

    test('should use endDate parameter with fixed dates', async () => {
      const linkId = await createDynamicLink({
        path: '/enddate-test',
        title: 'End Date Test',
        followLink: 'https://example.com',
      });

      const analyticsRef = db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(linkId)
        .collection('analytics');

      // Seed data for a fixed date in the past
      await analyticsRef.doc('2025-01-10').set({
        open_link_preview: { desktop: 3, android: 2, ios: 1 },
        redirects: { desktop: 0, android: 0, ios: 0 },
        first_opens_intent: { desktop: 0, android: 0, ios: 0 },
        first_opens_install: { desktop: 0, android: 0, ios: 0 },
        reopens: { desktop: 0, android: 0, ios: 0 },
      });

      const response = await request(HOST_BASE_URL)
        .get('/v1_campaign_analytics?campaignPath=/enddate-test&durationDays=7&endDate=2025-01-14')
        .set(API_KEY_HEADER, apiKey)
        .expect(200);

      expect(response.body.startDate).toBe('2025-01-08');
      expect(response.body.endDate).toBe('2025-01-14');
      expect(response.body.analytics['2025-01-10']).toBeDefined();
      expect(response.body.analytics['2025-01-10'].open_link_preview.desktop).toBe(3);
    });
  });
});
