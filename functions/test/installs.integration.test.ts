import * as request from 'supertest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  TRACEBACK_COLLECTION,
  INSTALLS_DOC,
  RECORDS_COLLECTION,
  DYNAMICLINKS_DOC,
} from '../src/common/constants';
import {
  getTestApiUrl,
  initializeTestFirebase,
  getTestFirestore,
  clearInstallRecords,
  cleanupTestFirebase,
} from './test-utils';

const HOST_BASE_URL = getTestApiUrl();

// Initialize Firebase Admin for emulator
initializeTestFirebase();

const db = getTestFirestore();

describe('Install Attribution - Integration Tests', () => {
  // Increase timeout for integration tests that interact with emulators
  jest.setTimeout(30000);

  beforeEach(async () => {
    // Clear install records before each test
    await clearInstallRecords();
  });

  afterAll(async () => {
    // Close all Firebase connections
    await cleanupTestFirebase();
  });

  describe('private_v1_preinstall_save_link', () => {
    test('should save device heuristics to Firestore', async () => {
      const deviceHeuristics = {
        language: 'en-US',
        languages: ['en-US', 'en'],
        timezone: 'America/New_York',
        screenWidth: 1920,
        screenHeight: 1080,
        devicePixelRatio: 2,
        platform: 'MacIntel',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        clipboard: 'https://example.com/summer',
        connectionType: '4g',
        hardwareConcurrency: 8,
        memory: 8,
        colorDepth: 24,
      };

      // Call the preinstall endpoint
      const response = await request(HOST_BASE_URL)
        .post('/v1_preinstall_save_link')
        .send(deviceHeuristics);

      // Verify HTTP response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.installId).toBeDefined();

      const installId = response.body.installId;

      // Verify data was saved to Firestore
      const installDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .get();

      expect(installDoc.exists).toBe(true);
      const data = installDoc.data();
      expect(data?.language).toBe('en-US');
      expect(data?.timezone).toBe('America/New_York');
      expect(data?.screenWidth).toBe(1920);
      expect(data?.screenHeight).toBe(1080);
      expect(data?.clipboard).toBe('https://example.com/summer');
      expect(data?.createdAt).toBeInstanceOf(Timestamp);
    });

    test('should track analytics when clipboard contains valid link', async () => {
      // 1. Create a dynamic link
      const dynamicLink = {
        path: '/summer',
        title: 'Summer Sale',
        description: 'Test link',
        followLink: 'https://example.com/products/summer-sale',
      };

      const linkDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(DYNAMICLINKS_DOC)
        .collection(RECORDS_COLLECTION)
        .add(dynamicLink);

      const linkUrl = `${HOST_BASE_URL}/summer`;

      // 2. Request the dynamic link to track a "click"
      await request(HOST_BASE_URL).get('/summer').redirects(0);

      // 3. Save device heuristics with clipboard pointing to the link (tracks "redirect")
      const deviceHeuristics = {
        language: 'en-US',
        languages: ['en-US'],
        timezone: 'America/New_York',
        screenWidth: 1920,
        screenHeight: 1080,
        devicePixelRatio: 2,
        platform: 'MacIntel',
        userAgent: 'Mozilla/5.0',
        clipboard: linkUrl,
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_preinstall_save_link')
        .send(deviceHeuristics);

      expect(response.statusCode).toBe(200);

      // 4. Verify analytics were tracked (clicks: 1, redirects: 1)
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

    test('should handle invalid payload gracefully', async () => {
      const invalidPayload = {
        language: 'en-US',
        // Missing required fields
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_preinstall_save_link')
        .send(invalidPayload);

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid payload');
    });
  });

  describe('private_v1_postinstall_search_link', () => {
    test('should find install by clipboard content (unique match)', async () => {
      const clipboardUrl = 'https://example.com/unique-test-link';

      // 1. Create a preinstall record
      const installId = 'test-install-123';
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .set({
          language: 'en-US',
          languages: ['en-US'],
          timezone: 'America/New_York',
          screenWidth: 1920,
          screenHeight: 1080,
          devicePixelRatio: 2,
          platform: 'MacIntel',
          userAgent: 'Mozilla/5.0',
          clipboard: clipboardUrl,
          createdAt: Timestamp.now(),
        });

      // 2. Call postinstall search
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: '1.0',
        uniqueMatchLinkToCheck: clipboardUrl,
        device: {
          deviceModelName: 'iPhone14,5',
          languageCode: 'en-US',
          languageCodeRaw: 'en-US',
          screenResolutionWidth: 1920,
          screenResolutionHeight: 1080,
          timezone: 'America/New_York',
        },
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_postinstall_search_link')
        .send(fingerprint);

      // 3. Verify response
      expect(response.statusCode).toBe(200);
      expect(response.body.deep_link_id).toBe(clipboardUrl);
      expect(response.body.match_type).toBe('unique');
      expect(response.body.match_message).toContain('uniquely matched');

      // 4. Verify install record was removed
      const installDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .get();

      expect(installDoc.exists).toBe(false);
    });

    test('should find install by heuristics when clipboard match fails', async () => {
      // 1. Create a preinstall record without exact clipboard match
      const installId = 'test-install-456';
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .set({
          language: 'en-US',
          languages: ['en-US'],
          timezone: 'America/New_York',
          screenWidth: 1920,
          screenHeight: 1080,
          devicePixelRatio: 2,
          platform: 'MacIntel',
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
          clipboard: 'https://example.com/some-link',
          createdAt: Timestamp.now(),
        });

      // 2. Call postinstall search with different clipboard but matching heuristics
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: '1.0',
        uniqueMatchLinkToCheck: 'https://example.com/different-link',
        device: {
          deviceModelName: 'iPhone14,5',
          languageCode: 'en-US',
          languageCodeRaw: 'en-US',
          screenResolutionWidth: 1920,
          screenResolutionHeight: 1080,
          timezone: 'America/New_York',
        },
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_postinstall_search_link')
        .send(fingerprint);

      // 3. Verify response - should find via heuristics
      expect(response.statusCode).toBe(200);
      expect(response.body.deep_link_id).toBe('https://example.com/some-link');
      expect(['heuristics', 'ambiguous']).toContain(response.body.match_type);
    });

    test('should return no match when no install found', async () => {
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: '1.0',
        device: {
          deviceModelName: 'iPhone14,5',
          languageCode: 'en-US',
          languageCodeRaw: 'en-US',
          screenResolutionWidth: 9999,
          screenResolutionHeight: 9999,
          timezone: 'America/New_York',
        },
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_postinstall_search_link')
        .send(fingerprint);

      expect(response.statusCode).toBe(200);
      expect(response.body.match_type).toBe('none');
      expect(response.body.match_message).toContain('No matching install');
    });
  });
});
