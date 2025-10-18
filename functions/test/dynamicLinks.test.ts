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

describe('Dynamic Link Redirect', () => {
  // Increase timeout for integration tests
  jest.setTimeout(30000);

  beforeEach(async () => {
    // Clear dynamic links before each test
    await clearDynamicLinkRecords();
  });

  afterEach(async () => {
    // Clear dynamic links after each test
    await clearDynamicLinkRecords();
  });

  afterAll(async () => {
    await cleanupTestFirebase();
  });

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

  describe('Analytics Tracking', () => {
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

      // 3. Verify analytics for that dynamic link has clicks: 1 for today's date
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.clicks).toBe(1);
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

      // 3. Verify analytics shows clicks: 2
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.clicks).toBe(2);
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

      // 4. Verify analytics shows clicks: 1, redirects: 1
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.clicks).toBe(1);
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
          sdkVersion: '1.0',
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

      // 5. Verify analytics shows clicks: 1, redirects: 1, first_opens_install: 1
      const today = new Date().toISOString().split('T')[0];
      const analyticsDoc = await linkDoc
        .collection('analytics')
        .doc(today)
        .get();

      expect(analyticsDoc.exists).toBe(true);
      const analyticsData = analyticsDoc.data();
      expect(analyticsData?.clicks).toBe(1);
      expect(analyticsData?.redirects).toBe(1);
      expect(analyticsData?.first_opens_install).toBe(1);
    });
  });
});
