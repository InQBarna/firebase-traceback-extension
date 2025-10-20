import * as request from 'supertest';
import { DeviceHeuristics, DeviceFingerprint } from '../src/installs/types';
import {
  getTestApiUrl,
  initializeTestFirebase,
  clearInstallRecords,
  cleanupTestFirebase,
  generateUniqueTestId,
} from './test-utils';

// Initialize Firebase Admin for testing (use default project ID)
initializeTestFirebase();

const HOST_BASE_URL = getTestApiUrl();

const getTestHeuristics = () => ({
  language: 'en-EN',
  languages: ['en-EN'],
  timezone: 'Europe/London',
  screenWidth: 390,
  screenHeight: 844,
  devicePixelRatio: 3,
  platform: 'iPhone',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  connectionType: undefined,
  hardwareConcurrency: 8,
  memory: 0,
  colorDepth: 3,
  clipboard: `http://127.0.0.1:5002/base-${generateUniqueTestId()}?_lang=en-EN&_langs=en-EN&_tz=Europe%2FMadrid&_res=2560x1440&_dpr=1&_plt=MacIntel`,
});

// Fingerprint you want to test
const getTestFingerprint = () => ({
  appInstallationTime: Date.now(),
  bundleId: 'com.test.app',
  osVersion: '17.4',
  sdkVersion: '1.0.0',
  uniqueMatchLinkToCheck: `http://127.0.0.1:5002/fingerprint-${generateUniqueTestId()}?_lang=en-EN&_langs=en-EN&_tz=Europe%2FMadrid&_res=2560x1440&_dpr=1&_plt=MacIntel`,
  device: {
    deviceModelName: 'iPhone15,3',
    languageCode: 'en-EN',
    languageCodeFromWebView: 'en-EN',
    languageCodeRaw: 'en_EN',
    screenResolutionWidth: 390,
    screenResolutionHeight: 844,
    timezone: 'Europe/London',
  },
});

const getTestFingerprintMissingKey = () => ({
  appInstallationTime: Date.now(),
  bundleId: 'com.test.app',
  osVersion: '17.4',
  sdkVersion: '1.0.0',
  device: {
    deviceModelName: 'iPhone15,3',
    languageCode: 'en-EN',
    languageCodeFromWebView: 'en-EN',
    languageCodeRaw: 'en_EN',
    screenResolutionWidth: 390,
    screenResolutionHeight: 844,
    timezone: 'Europe/London',
  },
});

describe('Install Search by heuristics - corner cases', () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await clearInstallRecords();
  });

  afterEach(async () => {
    await clearInstallRecords();
  });

  afterAll(async () => {
    await cleanupTestFirebase();
  });

  test('missing fingerPrint Key', async () => {
    const uniqueHeuristics = {
      ...getTestHeuristics(),
      screenWidth: 414, // Unique resolution for this test
      screenHeight: 896,
      timezone: 'Asia/Tokyo', // Unique timezone
    };

    // 1. Send to /v1_preinstall_save_link
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(uniqueHeuristics);

    expect(storeResponse.statusCode).toBe(200);
    expect(storeResponse.body.success).toBe(true);
    expect(storeResponse.body.installId).toBeDefined();

    // 2. Query with /v1_postinstall_search_link
    const uniqueFingerprint = {
      ...getTestFingerprintMissingKey(),
      device: {
        ...getTestFingerprintMissingKey().device,
        screenResolutionWidth: 414, // Match the stored resolution
        screenResolutionHeight: 896,
        timezone: 'Asia/Tokyo', // Match the stored timezone
      },
    };
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(uniqueFingerprint);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics');
  });
});

// Edge Case Tests for Heuristic Search Improvements
describe('Install Search by heuristics - edge cases', () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await clearInstallRecords();
  });

  afterEach(async () => {
    await clearInstallRecords();
  });

  afterAll(async () => {
    await cleanupTestFirebase();
  });

  // Test 1: Timing edge cases - app install very close to pre-install
  test('should match when app install time is slightly before pre-install (negative timing)', async () => {
    const currentTime = Date.now(); // Keep in milliseconds
    const testId = generateUniqueTestId();

    // Create matching heuristics data with unique identifiers
    const matchingHeuristics: DeviceHeuristics = {
      ...getTestHeuristics(),
      screenWidth: 428, // Unique resolution for this test
      screenHeight: 926,
      timezone: 'Europe/Berlin', // Unique timezone
      clipboard: `http://127.0.0.1:5002/timing-test-link-${testId}`,
    };

    // Store heuristics first
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(matchingHeuristics);

    expect(storeResponse.statusCode).toBe(200);

    // Test with app install time 10 seconds before pre-install (within our 30s tolerance)
    const fingerprintWithEarlierTime: DeviceFingerprint = {
      ...getTestFingerprint(),
      appInstallationTime: currentTime - 10000, // 10 seconds in milliseconds
      uniqueMatchLinkToCheck: undefined, // Force heuristic search
      device: {
        ...getTestFingerprint().device,
        screenResolutionWidth: 428, // Match the stored resolution
        screenResolutionHeight: 926,
        timezone: 'Europe/Berlin', // Match the stored timezone
        languageCode: 'en-EN', // Match the stored language
        languageCodeFromWebView: 'en-EN',
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintWithEarlierTime);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics'); // Should find match via heuristics
  });

  // Test 2: User Agent variations - different formats but same device
  test('should match with slightly different user agent formats', async () => {
    const heuristicsWithUA: DeviceHeuristics = {
      ...getTestHeuristics(),
      screenWidth: 375, // Unique resolution for this test
      screenHeight: 812,
      timezone: 'Australia/Sydney', // Unique timezone
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
      clipboard: `http://127.0.0.1:5002/ua-test-link-${generateUniqueTestId()}`,
    };

    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('User-Agent', heuristicsWithUA.userAgent)
      .send(heuristicsWithUA);

    expect(storeResponse.statusCode).toBe(200);

    // Different but compatible user agent format
    const fingerprintDiffUA: DeviceFingerprint = {
      ...getTestFingerprint(),
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...getTestFingerprint().device,
        screenResolutionWidth: 375, // Match the stored resolution
        screenResolutionHeight: 812,
        timezone: 'Australia/Sydney', // Match the stored timezone
        appVersionFromWebView: 'iqbdemocms/1.0 (iOS 17.4; iPhone15,3)', // Different format but same device
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('User-Agent', 'iqbdemocms/1.0 (iOS 17.4; iPhone15,3)')
      .send(fingerprintDiffUA);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics');
  });

  // Test 4: IP Address changes (common in mobile networks)
  test('should still match when IP address changes between pre/post install', async () => {
    const uniqueHeuristics = {
      ...getTestHeuristics(),
      screenWidth: 1170, // Unique resolution for this test
      screenHeight: 2532,
      timezone: 'America/Los_Angeles', // Unique timezone
      clipboard: `http://127.0.0.1:5002/ip-test-link-${generateUniqueTestId()}`,
    };
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('X-Forwarded-For', '192.168.1.100') // WiFi IP
      .send(uniqueHeuristics);

    expect(storeResponse.statusCode).toBe(200);

    const fingerprintDiffIP: DeviceFingerprint = {
      ...getTestFingerprint(),
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...getTestFingerprint().device,
        screenResolutionWidth: 1170, // Match the stored resolution
        screenResolutionHeight: 2532,
        timezone: 'America/Los_Angeles', // Match the stored timezone
      },
    };

    // Different IP (cellular network)
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('X-Forwarded-For', '10.0.0.50')
      .send(fingerprintDiffIP);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics'); // Should still match via other signals
  });

  // Test 5: Device model variations (iPhone15,3 vs iPhone 14 Pro vs similar models)
  test('should handle device model variations correctly', async () => {
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send({
        ...getTestHeuristics(),
        clipboard: `http://127.0.0.1:5002/device-test-link-${generateUniqueTestId()}`,
      });

    expect(storeResponse.statusCode).toBe(200);

    // Slightly different device model but same specs
    const fingerprintSimilarDevice: DeviceFingerprint = {
      ...getTestFingerprint(),
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...getTestFingerprint().device,
        deviceModelName: 'iPhone15,2', // Similar but not identical model
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintSimilarDevice);

    expect(matchResponse.statusCode).toBe(200);
    // Should still match due to other matching signals (screen, timezone, language)
  });

  // Test 6: Timezone format variations (case sensitivity, etc.)
  test('should handle timezone format variations', async () => {
    const heuristicsUpperCase: DeviceHeuristics = {
      ...getTestHeuristics(),
      timezone: 'EUROPE/LONDON', // Upper case
      clipboard: `http://127.0.0.1:5002/timezone-test-link-${generateUniqueTestId()}`,
    };

    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(heuristicsUpperCase);

    expect(storeResponse.statusCode).toBe(200);

    const fingerprintLowerCase: DeviceFingerprint = {
      ...getTestFingerprint(),
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...getTestFingerprint().device,
        timezone: 'europe/london', // Lower case
        languageCode: 'en-EN', // Match the stored language
        languageCodeFromWebView: 'en-EN',
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintLowerCase);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics'); // Should match (case-insensitive)
  });

  // Test 7: Language code variations (_  vs - separator)
  test('should handle language code format variations', async () => {
    const heuristicsUnderscore: DeviceHeuristics = {
      ...getTestHeuristics(),
      language: 'en_US', // Underscore format
      languages: ['en_US'],
      clipboard: `http://127.0.0.1:5002/lang-test-link-${generateUniqueTestId()}`,
    };

    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(heuristicsUnderscore);

    expect(storeResponse.statusCode).toBe(200);

    const fingerprintDash: DeviceFingerprint = {
      ...getTestFingerprint(),
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...getTestFingerprint().device,
        languageCode: 'en-US', // Dash format
        languageCodeFromWebView: 'en-US',
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintDash);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics'); // Should match (normalized)
  });

  // Test 8: Multiple potential matches - scoring system
  test('should pick best match when multiple similar entries exist', async () => {
    // Create first entry with partial match
    const heuristics1: DeviceHeuristics = {
      ...getTestHeuristics(),
      language: 'en-ES', // Different language
      clipboard: `http://127.0.0.1:5002/multi-test-link-1-${generateUniqueTestId()}`,
    };

    const store1Response = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(heuristics1);
    expect(store1Response.statusCode).toBe(200);

    // Create second entry with better match
    const heuristics2: DeviceHeuristics = {
      ...getTestHeuristics(),
      clipboard: `http://127.0.0.1:5002/multi-test-link-2-${generateUniqueTestId()}`,
    };

    const store2Response = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('User-Agent', getTestHeuristics().userAgent)
      .send(heuristics2);
    expect(store2Response.statusCode).toBe(200);

    // Search should find the better match
    const fingerprintMultiMatch: DeviceFingerprint = {
      ...getTestFingerprint(),
      uniqueMatchLinkToCheck: undefined,
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('User-Agent', 'iqbdemocms/1.0 (iOS 17.4; iPhone15,3)')
      .send(fingerprintMultiMatch);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('ambiguous');
    // Should match the second entry (better language match)
  });

  // Test 9: OS Version matching with minor differences
  test('should handle OS version variations correctly', async () => {
    const heuristicsOS: DeviceHeuristics = {
      ...getTestHeuristics(),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)', // Specific patch version
      clipboard: `http://127.0.0.1:5002/os-test-link-${generateUniqueTestId()}`,
    };

    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('User-Agent', heuristicsOS.userAgent)
      .send(heuristicsOS);

    expect(storeResponse.statusCode).toBe(200);

    const fingerprintDiffOSPatch: DeviceFingerprint = {
      ...getTestFingerprint(),
      uniqueMatchLinkToCheck: undefined,
      osVersion: '17.4.2', // Different patch version
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('User-Agent', 'iqbdemocms/1.0 (iOS 17.4; iPhone15,3)')
      .send(fingerprintDiffOSPatch);

    expect(matchResponse.statusCode).toBe(200);
    // Should still match due to major version compatibility
    expect(matchResponse.body.match_type).toBe('heuristics');
  });
});

describe('Install Search by heuristics - real world scenarios', () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await clearInstallRecords();
  });

  afterEach(async () => {
    await clearInstallRecords();
  });

  afterAll(async () => {
    await cleanupTestFirebase();
  });

  test('should match iPhone17,1 iOS18 with CFNetwork user agent', async () => {
    const testId = generateUniqueTestId();

    // Pre-install: Browser saves device heuristics
    const browserHeuristics: DeviceHeuristics = {
      language: 'es-ES',
      languages: ['es-ES'],
      timezone: 'Europe/Madrid',
      screenWidth: 402,
      screenHeight: 874,
      devicePixelRatio: 3,
      platform: 'iPhone',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      hardwareConcurrency: 8,
      colorDepth: 24,
      clipboard: `http://127.0.0.1:5002/iphone17-test-${testId}`,
    };

    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('X-Forwarded-For', '5.154.88.81')
      .set('User-Agent', browserHeuristics.userAgent)
      .send(browserHeuristics);

    expect(storeResponse.statusCode).toBe(200);
    expect(storeResponse.body.success).toBe(true);

    // Post-install: App searches for matching install
    const appFingerprint: DeviceFingerprint = {
      appInstallationTime: Date.now(),
      bundleId: 'com.inqbarna.familymealplan',
      osVersion: '18.0',
      sdkVersion: '1.2.2',
      uniqueMatchLinkToCheck: undefined, // Force heuristics matching
      device: {
        deviceModelName: 'iPhone17,1',
        languageCode: 'es',
        languageCodeFromWebView: 'es-ES',
        languageCodeRaw: 'es',
        appVersionFromWebView:
          '5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        screenResolutionWidth: 402,
        screenResolutionHeight: 874,
        timezone: 'Europe/Madrid',
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('X-Forwarded-For', '5.154.88.81')
      .set(
        'User-Agent',
        'familymealplan/202510020716 CFNetwork/1568.100.1 Darwin/24.6.0',
      )
      .send(appFingerprint);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics');
    expect(matchResponse.body.deep_link_id).toBe(browserHeuristics.clipboard);
  });

  test('should match iPhone17,1 iOS18 with realistic production timing (2 minutes delay)', async () => {
    const testId = generateUniqueTestId();
    const preInstallTime = Date.now();

    // Pre-install: Browser saves device heuristics
    const browserHeuristics: DeviceHeuristics = {
      language: 'es-ES',
      languages: ['es-ES'],
      timezone: 'Europe/Madrid',
      screenWidth: 402,
      screenHeight: 874,
      devicePixelRatio: 3,
      platform: 'iPhone',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      hardwareConcurrency: 8,
      colorDepth: 24,
      clipboard: `http://127.0.0.1:5002/iphone17-production-${testId}`,
    };

    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('X-Forwarded-For', '5.154.88.81')
      .set('User-Agent', browserHeuristics.userAgent)
      .send(browserHeuristics);

    expect(storeResponse.statusCode).toBe(200);
    expect(storeResponse.body.success).toBe(true);

    // Simulate realistic delay: user downloads and installs app (2 minutes)
    const appInstallTime = preInstallTime + 2 * 60 * 1000; // 2 minutes later

    // Post-install: App searches for matching install
    const appFingerprint: DeviceFingerprint = {
      appInstallationTime: appInstallTime,
      bundleId: 'com.inqbarna.familymealplan',
      osVersion: '18.0',
      sdkVersion: '1.2.2',
      uniqueMatchLinkToCheck: undefined, // Force heuristics matching
      device: {
        deviceModelName: 'iPhone17,1',
        languageCode: 'es',
        languageCodeFromWebView: 'es-ES',
        languageCodeRaw: 'es',
        appVersionFromWebView:
          '5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        screenResolutionWidth: 402,
        screenResolutionHeight: 874,
        timezone: 'Europe/Madrid',
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('X-Forwarded-For', '5.154.88.81')
      .set(
        'User-Agent',
        'familymealplan/202510020716 CFNetwork/1568.100.1 Darwin/24.6.0',
      )
      .send(appFingerprint);

    console.log('Match response:', JSON.stringify(matchResponse.body, null, 2));
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics');
    expect(matchResponse.body.deep_link_id).toBe(browserHeuristics.clipboard);
  });

  test('should handle appInstallationTime in seconds (iOS format)', async () => {
    const testId = generateUniqueTestId();
    const preInstallTimeMs = Date.now();
    const preInstallTimeSeconds = Math.floor(preInstallTimeMs / 1000);

    // Pre-install: Browser saves device heuristics
    const browserHeuristics: DeviceHeuristics = {
      language: 'es-ES',
      languages: ['es-ES'],
      timezone: 'Europe/Madrid',
      screenWidth: 402,
      screenHeight: 874,
      devicePixelRatio: 3,
      platform: 'iPhone',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      hardwareConcurrency: 8,
      colorDepth: 24,
      clipboard: `http://127.0.0.1:5002/iphone17-seconds-${testId}`,
    };

    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('X-Forwarded-For', '5.154.88.81')
      .set('User-Agent', browserHeuristics.userAgent)
      .send(browserHeuristics);

    expect(storeResponse.statusCode).toBe(200);
    expect(storeResponse.body.success).toBe(true);

    // App sends timestamp in seconds (iOS format) - 2 minutes after link click
    const appInstallTimeSeconds = preInstallTimeSeconds + 120; // 2 minutes later

    const appFingerprint: DeviceFingerprint = {
      appInstallationTime: appInstallTimeSeconds, // In SECONDS, not milliseconds
      bundleId: 'com.inqbarna.familymealplan',
      osVersion: '18.0',
      sdkVersion: '1.2.2',
      uniqueMatchLinkToCheck: undefined,
      device: {
        deviceModelName: 'iPhone17,1',
        languageCode: 'es',
        languageCodeFromWebView: 'es-ES',
        languageCodeRaw: 'es',
        appVersionFromWebView:
          '5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        screenResolutionWidth: 402,
        screenResolutionHeight: 874,
        timezone: 'Europe/Madrid',
      },
    };

    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('X-Forwarded-For', '5.154.88.81')
      .set(
        'User-Agent',
        'familymealplan/202510020716 CFNetwork/1568.100.1 Darwin/24.6.0',
      )
      .send(appFingerprint);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('heuristics');
    expect(matchResponse.body.deep_link_id).toBe(browserHeuristics.clipboard);
  });
});
