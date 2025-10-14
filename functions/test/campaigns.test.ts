import * as request from 'supertest';
import {
  getTestApiUrl,
  initializeTestFirebase,
  getTestFirestore,
  clearDynamicLinkRecords,
  cleanupTestFirebase,
} from './test-utils';
import { createDynamicLink } from './link-helpers';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
} from '../src/common/constants';

const HOST_BASE_URL = getTestApiUrl();

// Initialize Firebase Admin for emulator
initializeTestFirebase();

const db = getTestFirestore();

describe('Campaign API - v1_get_campaign', () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await clearDynamicLinkRecords();
  });

  afterEach(async () => {
    await clearDynamicLinkRecords();
  });

  afterAll(async () => {
    await cleanupTestFirebase();
  });

  test('should return followLink for valid campaign', async () => {
    // 1. Create a dynamic link
    await createDynamicLink({
      path: '/summer',
      title: 'Summer Sale',
      description: 'Test campaign',
      followLink: 'https://example.com/products/summer-sale',
    });

    // 2. Request the campaign with encoded URL
    const testUrl = `${HOST_BASE_URL}/summer`;
    const encodedUrl = encodeURIComponent(testUrl);

    const response = await request(HOST_BASE_URL)
      .get(`/v1_get_campaign?link=${encodedUrl}`)
      .expect(200);

    // 3. Verify response
    expect(response.body).toEqual({
      result: 'https://example.com/products/summer-sale',
    });
  });

  test('should return 404 for root path', async () => {
    const testUrl = `${HOST_BASE_URL}/`;
    const encodedUrl = encodeURIComponent(testUrl);

    const response = await request(HOST_BASE_URL)
      .get(`/v1_get_campaign?link=${encodedUrl}`)
      .expect(404);

    expect(response.body).toEqual({
      error: 'Campaign not found',
    });
  });

  test('should return 404 for non-existent campaign', async () => {
    const testUrl = `${HOST_BASE_URL}/nonexistent`;
    const encodedUrl = encodeURIComponent(testUrl);

    const response = await request(HOST_BASE_URL)
      .get(`/v1_get_campaign?link=${encodedUrl}`)
      .expect(404);

    expect(response.body).toEqual({
      error: 'Campaign not found',
    });
  });

  test('should return 400 for missing link parameter', async () => {
    const response = await request(HOST_BASE_URL)
      .get('/v1_get_campaign')
      .expect(400);

    expect(response.body).toEqual({
      error: 'Missing link parameter',
    });
  });

  test('should return 400 for invalid URL encoding', async () => {
    const response = await request(HOST_BASE_URL)
      .get('/v1_get_campaign?link=%E0%A4%A')
      .expect(400);

    expect(response.body).toEqual({
      error: 'Invalid URL encoding',
    });
  });

  test('should return 400 for invalid URL format', async () => {
    const invalidUrl = 'not-a-valid-url';
    const encodedUrl = encodeURIComponent(invalidUrl);

    const response = await request(HOST_BASE_URL)
      .get(`/v1_get_campaign?link=${encodedUrl}`)
      .expect(400);

    expect(response.body).toEqual({
      error: 'Invalid URL format',
    });
  });

  test('should return 404 when campaign has no followLink', async () => {
    // 1. Create a dynamic link without followLink
    await createDynamicLink({
      path: '/no-follow',
      title: 'No Follow Link',
      description: 'Test campaign without follow link',
    });

    // 2. Request the campaign
    const testUrl = `${HOST_BASE_URL}/no-follow`;
    const encodedUrl = encodeURIComponent(testUrl);

    const response = await request(HOST_BASE_URL)
      .get(`/v1_get_campaign?link=${encodedUrl}`)
      .expect(404);

    expect(response.body).toEqual({
      error: 'Campaign has no follow link',
    });
  });

  test('should handle URL with query parameters', async () => {
    // 1. Create a dynamic link
    await createDynamicLink({
      path: '/promo',
      title: 'Promo',
      description: 'Test promo',
      followLink: 'https://example.com/promo?code=SAVE20',
    });

    // 2. Request with query params in the link
    const testUrl = `${HOST_BASE_URL}/promo?utm_source=email`;
    const encodedUrl = encodeURIComponent(testUrl);

    const response = await request(HOST_BASE_URL)
      .get(`/v1_get_campaign?link=${encodedUrl}`)
      .expect(200);

    expect(response.body).toEqual({
      result: 'https://example.com/promo?code=SAVE20',
    });
  });

  describe('Analytics Tracking', () => {
    test('should track APP_FIRST_OPEN_INTENT when first_campaign_open=true', async () => {
      // 1. Create a dynamic link
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/analytics-test',
          title: 'Analytics Test',
          description: 'Test analytics tracking',
          followLink: 'https://example.com/analytics',
        });

      // 2. Request with first_campaign_open=true
      const testUrl = `${HOST_BASE_URL}/analytics-test`;
      const encodedUrl = encodeURIComponent(testUrl);

      const response = await request(HOST_BASE_URL)
        .get(`/v1_get_campaign?link=${encodedUrl}&first_campaign_open=true`)
        .expect(200);

      expect(response.body).toEqual({
        result: 'https://example.com/analytics',
      });

      // 3. Verify analytics tracked first_opens_intent: 1
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.first_opens_intent).toBe(1);
      expect(analyticsData?.reopens).toBe(0);
    });

    test('should track APP_REOPEN when first_campaign_open=false', async () => {
      // 1. Create a dynamic link
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/reopen-test',
          title: 'Reopen Test',
          description: 'Test reopen tracking',
          followLink: 'https://example.com/reopen',
        });

      // 2. Request with first_campaign_open=false
      const testUrl = `${HOST_BASE_URL}/reopen-test`;
      const encodedUrl = encodeURIComponent(testUrl);

      const response = await request(HOST_BASE_URL)
        .get(`/v1_get_campaign?link=${encodedUrl}&first_campaign_open=false`)
        .expect(200);

      expect(response.body).toEqual({
        result: 'https://example.com/reopen',
      });

      // 3. Verify analytics tracked reopens: 1
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.reopens).toBe(1);
      expect(analyticsData?.first_opens_intent).toBe(0);
    });

    test('should not track analytics when first_campaign_open is not provided', async () => {
      // 1. Create a dynamic link
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/no-analytics',
          title: 'No Analytics',
          description: 'Test no analytics',
          followLink: 'https://example.com/no-analytics',
        });

      // 2. Request without first_campaign_open parameter
      const testUrl = `${HOST_BASE_URL}/no-analytics`;
      const encodedUrl = encodeURIComponent(testUrl);

      const response = await request(HOST_BASE_URL)
        .get(`/v1_get_campaign?link=${encodedUrl}`)
        .expect(200);

      expect(response.body).toEqual({
        result: 'https://example.com/no-analytics',
      });

      // 3. Verify no analytics document was created
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(false);
    });

    test('should track multiple first_opens_intent when called twice', async () => {
      // 1. Create a dynamic link
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/multiple-opens',
          title: 'Multiple Opens',
          description: 'Test multiple opens',
          followLink: 'https://example.com/multiple',
        });

      const testUrl = `${HOST_BASE_URL}/multiple-opens`;
      const encodedUrl = encodeURIComponent(testUrl);

      // 2. Request twice with first_campaign_open=true
      await request(HOST_BASE_URL)
        .get(`/v1_get_campaign?link=${encodedUrl}&first_campaign_open=true`)
        .expect(200);

      await request(HOST_BASE_URL)
        .get(`/v1_get_campaign?link=${encodedUrl}&first_campaign_open=true`)
        .expect(200);

      // 3. Verify analytics tracked first_opens_intent: 2
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.first_opens_intent).toBe(2);
    });
  });
});
