import * as request from 'supertest';
import {
  getTestApiUrl,
  initializeTestFirebase,
  getTestFirestore,
  clearDynamicLinkRecords,
  cleanupTestFirebase,
  createTestApiKey,
  clearApiKeyRecords,
} from './test-utils';
import { createDynamicLink } from './link-helpers';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
  API_KEY_HEADER,
} from '../src/common/constants';

const HOST_BASE_URL = getTestApiUrl();

// Initialize Firebase Admin for emulator
initializeTestFirebase();

const db = getTestFirestore();

describe('Campaign API - v1_create_campaign', () => {
  jest.setTimeout(30000);

  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createTestApiKey('Test key for campaign create');
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
        .post('/v1_create_campaign')
        .send({ path: '/test' })
        .expect(401);

      expect(response.body.error).toBe('API key required');
    });

    test('should return 403 with invalid API key', async () => {
      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, 'invalid-api-key')
        .send({ path: '/test' })
        .expect(403);

      expect(response.body.error).toBe('Invalid API key');
    });
  });

  describe('Validation', () => {
    test('should return 400 when path is missing', async () => {
      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({ title: 'No path' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    test('should return 400 when path does not start with /', async () => {
      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({ path: 'no-slash' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    test('should return 400 when path is just "/"', async () => {
      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({ path: '/' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    test('should return 400 when expires is not a valid date', async () => {
      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({ path: '/test', expires: 'not-a-date' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('Duplicate detection', () => {
    test('should return 409 when path already exists', async () => {
      // Create existing link
      await createDynamicLink({
        path: '/existing',
        title: 'Existing Campaign',
      });

      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({ path: '/existing', title: 'Duplicate' })
        .expect(409);

      expect(response.body.error).toBe(
        'A campaign with this path already exists',
      );
    });
  });

  describe('Success cases', () => {
    test('should create campaign with minimal fields (path only)', async () => {
      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({ path: '/minimal' })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.path).toBe('/minimal');
      expect(response.body.campaignUrl).toContain('/minimal');
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    test('should create campaign with all fields', async () => {
      const response = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({
          path: '/full-campaign',
          title: 'Full Campaign',
          description: 'A fully populated campaign',
          image: 'https://example.com/image.png',
          followLink: 'https://example.com/products/summer',
          expires: '2025-12-31T23:59:59.000Z',
          appleAffiliateToken: 'affiliate123',
          appleCampaignText: 'summer_campaign',
          appleMediaType: '8',
          appleProviderId: 'provider456',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.path).toBe('/full-campaign');
      expect(response.body.title).toBe('Full Campaign');
      expect(response.body.description).toBe('A fully populated campaign');
      expect(response.body.image).toBe('https://example.com/image.png');
      expect(response.body.followLink).toBe(
        'https://example.com/products/summer',
      );
      expect(response.body.expires).toBe('2025-12-31T23:59:59.000Z');
      expect(response.body.appleAffiliateToken).toBe('affiliate123');
      expect(response.body.appleCampaignText).toBe('summer_campaign');
      expect(response.body.appleMediaType).toBe('8');
      expect(response.body.appleProviderId).toBe('provider456');
      expect(response.body.campaignUrl).toContain('/full-campaign');
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    test('created link is retrievable via GET /v1_get_campaign', async () => {
      // Create via API
      const createResponse = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({
          path: '/api-created',
          title: 'API Created',
          followLink: 'https://example.com/api-created',
        })
        .expect(201);

      // Retrieve via GET
      const campaignUrl = createResponse.body.campaignUrl;
      const encodedUrl = encodeURIComponent(campaignUrl);

      const getResponse = await request(HOST_BASE_URL)
        .get(`/v1_get_campaign?link=${encodedUrl}`)
        .expect(200);

      expect(getResponse.body.result).toBe(
        'https://example.com/api-created',
      );
    });

    test('created link appears in GET /v1_campaigns listing', async () => {
      // Create via API
      await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({
          path: '/listed-campaign',
          title: 'Listed Campaign',
          followLink: 'https://example.com/listed',
        })
        .expect(201);

      // Retrieve listing
      const listResponse = await request(HOST_BASE_URL)
        .get('/v1_campaigns')
        .set(API_KEY_HEADER, apiKey)
        .expect(200);

      const campaigns = listResponse.body.campaigns;
      const found = campaigns.find(
        (c: { path: string }) => c.path === '/listed-campaign',
      );
      expect(found).toBeDefined();
      expect(found.title).toBe('Listed Campaign');
      expect(found.followLink).toBe('https://example.com/listed');
    });
  });

  describe('Expires conversion', () => {
    test('ISO string is correctly stored as Firestore Timestamp', async () => {
      const expiresISO = '2025-12-31T23:59:59.000Z';

      const createResponse = await request(HOST_BASE_URL)
        .post('/v1_create_campaign')
        .set(API_KEY_HEADER, apiKey)
        .send({
          path: '/expires-test',
          title: 'Expires Test',
          expires: expiresISO,
        })
        .expect(201);

      // Read directly from Firestore to verify Timestamp storage
      const docId = createResponse.body.id;
      const doc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(docId)
        .get();

      expect(doc.exists).toBe(true);
      const data = doc.data();
      expect(data?.expires).toBeDefined();
      // Firestore Timestamps have toDate() method
      expect(data?.expires.toDate().toISOString()).toBe(expiresISO);
    });
  });
});
