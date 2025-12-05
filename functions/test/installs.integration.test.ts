import * as request from 'supertest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  TRACEBACK_COLLECTION,
  INSTALLS_DOC,
  RECORDS_COLLECTION,
} from '../src/common/constants';
import {
  getTestApiUrl,
  initializeTestFirebase,
  getTestFirestore,
  clearInstallRecords,
  cleanupTestFirebase,
  generateUniqueTestId,
} from './test-utils';
import { createDynamicLink } from './link-helpers';

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

  describe('Install Creation', () => {
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

  describe('Install Search with clipboard - unique', () => {
    test('should find install by clipboard content (unique match) with utm', async () => {
      const clipboardUrl =
        'https://example.com/unique-test-link?utm_source=newsletter&utm_medium=email';

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
        sdkVersion: 'ios/0.3.1',
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
      expect(response.body.match_campaign).toBeUndefined();

      // 4. Verify install record was removed
      const installDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .get();

      expect(installDoc.exists).toBe(false);
    });

    test('should return plain link for SDK version 0.3.0 (non-legacy format)', async () => {
      const clipboardUrl = `http://127.0.0.1:5002/test-link-${generateUniqueTestId()}`;

      // 1. Save install with clipboard
      const installId = `test-install-${generateUniqueTestId()}`;
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .set({
          language: 'en-US',
          timezone: 'America/New_York',
          screenWidth: 1920,
          screenHeight: 1080,
          clipboard: clipboardUrl,
          createdAt: Timestamp.now(),
        });

      // 2. Search with matching fingerprint using SDK 0.3.0
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.test.app',
        osVersion: '17.0',
        sdkVersion: 'android/0.3.0', // Non-legacy version
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

      // 3. Verify response returns plain link (not wrapped in legacy format)
      expect(response.statusCode).toBe(200);
      expect(response.body.deep_link_id).toBe(clipboardUrl);
      expect(response.body.match_type).toBe('unique');
    });

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
        sdkVersion: 'ios/0.3.1',
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
      expect(response.body.match_campaign).toBeUndefined();

      // 4. Verify install record was removed
      const installDoc = await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .get();

      expect(installDoc.exists).toBe(false);
    });

    test('should return plain link for SDK version 0.3.0 (non-legacy format)', async () => {
      const clipboardUrl = `http://127.0.0.1:5002/test-link-${generateUniqueTestId()}`;

      // 1. Save install with clipboard
      const installId = `test-install-${generateUniqueTestId()}`;
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .set({
          language: 'en-US',
          timezone: 'America/New_York',
          screenWidth: 1920,
          screenHeight: 1080,
          clipboard: clipboardUrl,
          createdAt: Timestamp.now(),
        });

      // 2. Search with matching fingerprint using SDK 0.3.0
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.test.app',
        osVersion: '17.0',
        sdkVersion: 'android/0.3.0', // Non-legacy version
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

      // 3. Verify response returns plain link (not wrapped in legacy format)
      expect(response.statusCode).toBe(200);
      expect(response.body.deep_link_id).toBe(clipboardUrl);
      expect(response.body.match_type).toBe('unique');
    });

    test('should resolve campaign link in clipboard to followLink', async () => {
      // 1. Create a dynamic link (campaign)
      const campaignPath = '/winter-sale';
      const followLink = 'https://example.com/products/winter-sale';
      await createDynamicLink({
        path: campaignPath,
        title: 'Winter Sale Campaign',
        description: 'Winter sale campaign',
        followLink: followLink,
      });

      const clipboardCampaignUrl = `${HOST_BASE_URL}${campaignPath}`;

      // 2. Create a preinstall record with campaign URL in clipboard
      const installId = 'test-install-campaign-123';
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
          clipboard: clipboardCampaignUrl,
          createdAt: Timestamp.now(),
        });

      // 3. Call postinstall search
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'ios/0.3.0',
        uniqueMatchLinkToCheck: clipboardCampaignUrl,
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

      // 4. Verify response returns the followLink (not the campaign URL)
      expect(response.statusCode).toBe(200);
      // SDK version >= 0.3.0 returns plain link (new format)
      expect(response.body.deep_link_id).toBe(followLink);
      expect(response.body.match_type).toBe('unique');
      expect(response.body.match_message).toContain('uniquely matched');
      expect(response.body.match_campaign).toBe('winter-sale');
    });
  });

  describe('Install Search by heuristics - heuristics', () => {
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
        sdkVersion: 'android/0.4.0 build3001',
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
      // SDK version >= 0.3.0 returns plain link (new format)
      expect(response.body.deep_link_id).toBe('https://example.com/some-link');
      expect(['heuristics', 'ambiguous']).toContain(response.body.match_type);
    });
  });

  describe('Install Search by heuristics - heuristics', () => {
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
          clipboard: 'https://example.com/some-link?utm_source=newsletter&utm_medium=email',
          createdAt: Timestamp.now(),
        });

      // 2. Call postinstall search with different clipboard but matching heuristics
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'android/0.4.0 build3001',
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
      // SDK version >= 0.3.0 returns plain link (new format)
      expect(response.body.deep_link_id).toBe(
        'https://example.com/some-link?utm_source=newsletter&utm_medium=email',
      );
      expect(['heuristics', 'ambiguous']).toContain(response.body.match_type);
    });
  });

  describe('Install Search - not found', () => {
    test('should return no match when no install found', async () => {
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'ios/0.4.0',
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

    test('should not match when language mismatches', async () => {
      const uniqueTestId = generateUniqueTestId();
      const clipboardUrl = `https://example.com/lang-mismatch-${uniqueTestId}`;

      // 1. Create preinstall record with Spanish language
      const installId = 'test-install-lang-mismatch';
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .set({
          language: 'es-CA',
          languages: ['es-CA'],
          timezone: 'America/Toronto',
          screenWidth: 428,
          screenHeight: 926,
          devicePixelRatio: 2,
          platform: 'iPhone',
          userAgent: 'Mozilla/5.0',
          clipboard: clipboardUrl,
          createdAt: Timestamp.now(),
        });

      // 2. Query with English language (should not match)
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'android/0.3.5',
        uniqueMatchLinkToCheck: undefined,
        device: {
          deviceModelName: 'iPhone14,5',
          languageCode: 'en-US',
          languageCodeRaw: 'en-US',
          screenResolutionWidth: 428,
          screenResolutionHeight: 926,
          timezone: 'America/Toronto',
        },
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_postinstall_search_link')
        .send(fingerprint);

      expect(response.statusCode).toBe(200);
      expect(response.body.match_type).toBe('none');
    });

    test('should not match when timing is outside tolerance window', async () => {
      const currentTime = Date.now();
      const uniqueTestId = generateUniqueTestId();
      const clipboardUrl = `https://example.com/timing-fail-${uniqueTestId}`;

      // 1. Create preinstall record
      const installId = 'test-install-timing';
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .set({
          language: 'fr-FR',
          languages: ['fr-FR'],
          timezone: 'Europe/Paris',
          screenWidth: 375,
          screenHeight: 812,
          devicePixelRatio: 2,
          platform: 'iPhone',
          userAgent: 'Mozilla/5.0',
          clipboard: clipboardUrl,
          createdAt: Timestamp.now(),
        });

      // 2. Query with app install time 60 seconds before preinstall (beyond 30s tolerance)
      const fingerprint = {
        appInstallationTime: currentTime - 60000, // 60 seconds ago
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'ios/0.5.2',
        uniqueMatchLinkToCheck: undefined,
        device: {
          deviceModelName: 'iPhone14,5',
          languageCode: 'fr-FR',
          languageCodeRaw: 'fr-FR',
          screenResolutionWidth: 375,
          screenResolutionHeight: 812,
          timezone: 'Europe/Paris',
        },
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_postinstall_search_link')
        .send(fingerprint);

      expect(response.statusCode).toBe(200);
      expect(response.body.match_type).toBe('none');
    });

    test('should not match with different screen resolutions', async () => {
      const uniqueTestId = generateUniqueTestId();
      const clipboardUrl = `https://example.com/resolution-fail-${uniqueTestId}`;

      // 1. Create preinstall record with specific resolution
      const installId = 'test-install-resolution';
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc(INSTALLS_DOC)
        .collection(RECORDS_COLLECTION)
        .doc(installId)
        .set({
          language: 'en-US',
          languages: ['en-US'],
          timezone: 'America/New_York',
          screenWidth: 390,
          screenHeight: 844,
          devicePixelRatio: 3,
          platform: 'iPhone',
          userAgent: 'Mozilla/5.0',
          clipboard: clipboardUrl,
          createdAt: Timestamp.now(),
        });

      // 2. Query with different resolution (should not match)
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'android/0.6.0 build4002',
        uniqueMatchLinkToCheck: undefined,
        device: {
          deviceModelName: 'iPhone14,5',
          languageCode: 'en-US',
          languageCodeRaw: 'en-US',
          screenResolutionWidth: 414, // Different resolution
          screenResolutionHeight: 896,
          timezone: 'America/New_York',
        },
      };

      const response = await request(HOST_BASE_URL)
        .post('/v1_postinstall_search_link')
        .send(fingerprint);

      expect(response.statusCode).toBe(200);
      expect(response.body.match_type).toBe('none');
    });
  });

  describe('Install Search with intentLink', () => {
    test('should return intentLink when search fails and intentLink is direct URL', async () => {
      const intentLink = `${HOST_BASE_URL}/campaign?link=https://direct.example.com/product`;

      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'ios/0.3.0',
        intentLink: intentLink,
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
      expect(response.body.deep_link_id).toBe(
        'https://direct.example.com/product',
      );
      expect(response.body.match_type).toBe('intent');
    });

    test('should return campaign followLink when search fails and intentLink points to campaign', async () => {
      // Create a campaign
      await db
        .collection(TRACEBACK_COLLECTION)
        .doc('dynamiclinks')
        .collection(RECORDS_COLLECTION)
        .add({
          path: '/summer-intent',
          title: 'Summer Sale',
          description: 'Test campaign',
          followLink: 'https://example.com/summer-campaign',
        });

      const intentLink = `${HOST_BASE_URL}/summer-intent`;

      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'android/0.3.1',
        intentLink: intentLink,
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
      expect(response.body.deep_link_id).toBe(
        'https://example.com/summer-campaign',
      );
      expect(response.body.match_type).toBe('intent');
      expect(response.body.match_campaign).toBe('summer-intent');
    });

    test('should return matched link when search succeeds and intentLink matches', async () => {
      const clipboardUrl = 'https://example.com/matched-intent';

      // Create preinstall record
      const installId = 'test-install-intent-match';
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

      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'ios/0.4.5',
        uniqueMatchLinkToCheck: clipboardUrl,
        intentLink: `${HOST_BASE_URL}/some-campaign?link=${clipboardUrl}`,
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

      expect(response.statusCode).toBe(200);
      expect(response.body.deep_link_id).toBe(clipboardUrl);
      expect(response.body.match_type).toBe('unique');
    });

    test('should return intentLink when search succeeds but intentLink differs', async () => {
      const clipboardUrl = 'https://example.com/clipboard-link';

      // Create preinstall record
      const installId = 'test-install-intent-differ';
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

      const differentIntentUrl = 'https://example.com/different-intent';
      const fingerprint = {
        appInstallationTime: Date.now(),
        bundleId: 'com.example.app',
        osVersion: '14.0',
        sdkVersion: 'android/0.5.0 build5001',
        uniqueMatchLinkToCheck: clipboardUrl,
        intentLink: `${HOST_BASE_URL}/campaign?link=${differentIntentUrl}`,
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

      expect(response.statusCode).toBe(200);
      expect(response.body.deep_link_id).toBe(differentIntentUrl);
      expect(response.body.match_type).toBe('intent');
      expect(response.body.match_message).toContain('intentLink');
    });
  });
});
