import * as request from 'supertest';
import {
  getTestApiUrl,
  initializeTestFirebase,
  getTestFirestore,
  clearDynamicLinkRecords,
  cleanupTestFirebase,
} from './test-utils';
import { createDynamicLink, testLinks } from './link-helpers';
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

  describe('Campaign link resolution', () => {
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

    test('should return followLink when missing link parameter', async () => {
      // 1. Create a dynamic link for default fallback
      await createDynamicLink({
        path: '/default',
        title: 'Default Campaign',
        description: 'Default campaign for missing link parameter',
        followLink: 'https://example.com/products/default-sale',
      });

      const response = await request(HOST_BASE_URL)
        .get('/v1_get_campaign')
        .expect(200);

      expect(response.body).toEqual({
        result: 'https://example.com/products/default-sale',
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
  });

  describe('Analytics Tracking - opens', () => {
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

  describe('Link preview', () => {
    test('should redirect when followLink is present', async () => {
      // 1. Create a test dynamic link
      await createDynamicLink(testLinks.example);

      // 2. Request the /example path (which should have the test link)
      const linkResponse = await request(HOST_BASE_URL)
        .get('/example')
        .redirects(0); // Don't follow redirects automatically

      // 3. Verify redirect response
      expect(linkResponse.statusCode).toBe(302);
      expect(linkResponse.headers.location).toBeDefined();

      // 4. Verify the redirect URL contains the link parameter and uses correct host
      const redirectUrl = new URL(linkResponse.headers.location, HOST_BASE_URL);
      expect(redirectUrl.searchParams.get('link')).toBe(
        testLinks.example.followLink,
      );
      expect(redirectUrl.pathname).toBe('/example');

      // 5. Verify redirect stays on hosting domain (not internal Cloud Functions domain)
      const expectedHostname = HOST_BASE_URL.includes('127.0.0.1')
        ? '127.0.0.1'
        : new URL(HOST_BASE_URL).hostname;
      const expectedProtocol = HOST_BASE_URL.startsWith('https')
        ? 'https:'
        : 'http:';

      expect(redirectUrl.hostname).toBe(expectedHostname);
      expect(redirectUrl.protocol).toBe(expectedProtocol);
      expect(redirectUrl.href).not.toContain('cloudfunctions.net');
    });

    test('should return HTML preview when link parameter already exists', async () => {
      // 1. Create a test dynamic link
      await createDynamicLink(testLinks.example);

      // 2. Request with link parameter already in URL - should not redirect again
      const linkResponse = await request(HOST_BASE_URL)
        .get('/example?link=https://alreadyhere.com')
        .redirects(0);

      // 3. Should return 200 with HTML content (not redirect)
      expect(linkResponse.statusCode).toBe(200);
      expect(linkResponse.headers['content-type']).toMatch(/html/);
    });

    test('should return 200 for unknown path', async () => {
      // Request a path that doesn't exist in dynamic links
      const linkResponse = await request(HOST_BASE_URL)
        .get('/nonexistent-path-12345')
        .redirects(0);

      // Should return 200 with default HTML (not 404)
      expect(linkResponse.statusCode).toBe(200);
      expect(linkResponse.headers['content-type']).toMatch(/html/);
    });
  });

  describe('Analytics Tracking - Click', () => {
    test('should track analytics when opening a dynamic link', async () => {
      // 1. Create a dummy dynamic link with path /feature
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/feature',
          title: 'Feature Test',
          description: 'Test link for analytics',
          followLink: 'https://example.com/feature',
        });

      // 2. Request to the host URL /feature
      const response = await request(HOST_BASE_URL)
        .get('/feature')
        .redirects(0);

      expect(response.statusCode).toBe(302);

      // 3. Verify analytics for that dynamic link has open_link_preview: 1 for today's date
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.open_link_preview).toBe(1);
    });

    test('should track as many analytics as openings of the dynamic link (2)', async () => {
      // 1. Create a dummy dynamic link with path /feature
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/feature',
          title: 'Feature Test',
          description: 'Test link for analytics',
          followLink: 'https://example.com/feature',
        });

      // 2. Request to the host URL /feature twice
      await request(HOST_BASE_URL).get('/feature').redirects(0);
      await request(HOST_BASE_URL).get('/feature').redirects(0);

      // 3. Verify analytics shows open_link_preview: 2
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.open_link_preview).toBe(2);
    });

    test('should track 1 click and 1 redirect when opening dynamic link and calling preinstall link creation', async () => {
      // 1. Create a dummy dynamic link with path /feature
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/feature',
          title: 'Feature Test',
          description: 'Test link for analytics',
          followLink: 'https://example.com/feature',
        });

      const linkUrl = `${HOST_BASE_URL}/feature`;

      // 2. Request to the host URL /feature (click)
      await request(HOST_BASE_URL).get('/feature').redirects(0);

      // 3. Call preinstall link creation with clipboard containing the link (redirect)
      await request(HOST_BASE_URL)
        .post('/v1_preinstall_save_link')
        .send({
          language: 'en-US',
          languages: ['en-US'],
          timezone: 'America/New_York',
          screenWidth: 1920,
          screenHeight: 1080,
          devicePixelRatio: 2,
          platform: 'MacIntel',
          userAgent: 'Mozilla/5.0',
          clipboard: linkUrl,
        });

      // 4. Verify analytics shows open_link_preview: 1, redirects: 1
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.open_link_preview).toBe(1);
      expect(analyticsData?.redirects).toBe(1);
    });

    test('should track 1 click, 1 redirect and 1 install when opening dynamic link, calling preinstall and calling post-install', async () => {
      // 1. Create a dummy dynamic link with path /feature
      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/feature',
          title: 'Feature Test',
          description: 'Test link for analytics',
          followLink: 'https://example.com/feature',
        });

      const linkUrl = `${HOST_BASE_URL}/feature`;

      // 2. Request to the host URL /feature (click)
      await request(HOST_BASE_URL).get('/feature').redirects(0);

      // 3. Call preinstall link creation with clipboard containing the link (redirect)
      await request(HOST_BASE_URL)
        .post('/v1_preinstall_save_link')
        .send({
          language: 'en-US',
          languages: ['en-US'],
          timezone: 'America/New_York',
          screenWidth: 1920,
          screenHeight: 1080,
          devicePixelRatio: 2,
          platform: 'MacIntel',
          userAgent: 'Mozilla/5.0',
          clipboard: linkUrl,
        });

      // 4. Call post-install search with matching data (install)
      await request(HOST_BASE_URL)
        .post('/v1_postinstall_search_link')
        .send({
          appInstallationTime: Date.now(),
          bundleId: 'com.example.app',
          osVersion: '14.0',
          sdkVersion: 'ios/0.3.5',
          uniqueMatchLinkToCheck: linkUrl,
          device: {
            deviceModelName: 'iPhone14,5',
            languageCode: 'en-US',
            languageCodeRaw: 'en-US',
            screenResolutionWidth: 1920,
            screenResolutionHeight: 1080,
            timezone: 'America/New_York',
          },
        });

      // 5. Verify analytics shows open_link_preview: 1, redirects: 1, first_opens_install: 1
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.open_link_preview).toBe(1);
      expect(analyticsData?.redirects).toBe(1);
      expect(analyticsData?.first_opens_install).toBe(1);
    });
  });
});
