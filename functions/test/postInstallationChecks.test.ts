import * as request from 'supertest'
import { DeviceHeuristics, DeviceFingerprint } from '../src/installs/types'

const HOST_BASE_URL = process.env.TRACEBACK_API_URL ?? 'http://localhost:5002';
// const HOST_BASE_URL = process.env.TRACEBACK_API_URL ?? 'https://familymealplan-pre-traceback.web.app';
// const HOST_BASE_URL = process.env.TRACEBACK_API_URL ?? 'https://apptdvtest-fab2a-traceback.web.app';
// const HOST_BASE_URL = process.env.TRACEBACK_API_URL ?? 'https://apptdv-traceback.web.app';


const testHeuristics: DeviceHeuristics = {
  language: 'en-EN',
  languages: ['en-EN'],
  timezone: 'Europe/London',
  screenWidth: 390,
  screenHeight: 844,
  devicePixelRatio: 3,
  platform: 'iPhone',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  connectionType: undefined,
  hardwareConcurrency: 8,
  memory: 0,
  colorDepth: 3,
  clipboard: 'http://127.0.0.1:5002/xxx?_lang=en-EN&_langs=en-EN&_tz=Europe%2FMadrid&_res=2560x1440&_dpr=1&_plt=MacIntel'
}

// Fingerprint you want to test
const testFingerprint: DeviceFingerprint = {
  appInstallationTime: Date.now(),
  bundleId: 'com.test.app',
  osVersion: '17.4',
  sdkVersion: '1.0.0',
  uniqueMatchLinkToCheck: 'http://127.0.0.1:5002/xxx?_lang=en-EN&_langs=en-EN&_tz=Europe%2FMadrid&_res=2560x1440&_dpr=1&_plt=MacIntel',
  device: {
    deviceModelName: 'iPhone15,3',
    languageCode: 'en-EN',
    languageCodeFromWebView: 'en-EN',
    languageCodeRaw: 'en_EN',
    screenResolutionWidth: 390,
    screenResolutionHeight: 844,
    timezone: 'Europe/London'
  }
};

describe('TraceBack API Integration', () => {
  test('should store and retrieve a fingerprint', async () => {
    // 1. Send to /v1_preinstall_save_link
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(testHeuristics)

    expect(storeResponse.statusCode).toBe(200)
    expect(storeResponse.body.success).toBe(true)
    expect(storeResponse.body.installId).toBeDefined()

    // 2. Query with /v1_postinstall_search_link
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(testFingerprint)
      .expect(200)

    expect(matchResponse.body.deep_link_id).toBe(testFingerprint.uniqueMatchLinkToCheck)
    expect(matchResponse.body.match_type).toBe('unique')
  })
})

describe('TraceBack API Integration', () => {
  test('should store and retrieve a fingerprint when no clipboard', async () => {
    // 1. Send to /v1_preinstall_save_link
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
      .send(testHeuristics)


      console.log(storeResponse)
    expect(storeResponse.statusCode).toBe(200)
    expect(storeResponse.body.success).toBe(true)
    expect(storeResponse.body.installId).toBeDefined()

    // 2. Query with /v1_postinstall_search_link
    let fingerPrintNoClipboard: DeviceFingerprint = testFingerprint
    fingerPrintNoClipboard.uniqueMatchLinkToCheck = undefined
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('User-Agent', 'iqbdemocms/1.0 (iOS 17.4; iPhone15,5)')
      .send(fingerPrintNoClipboard)

    expect(matchResponse.statusCode).toBe(200)
    expect(matchResponse.body.match_type).toBe('ambiguous')
  })
})

describe('TraceBack API Integration', () => {
  test('should store and retrieve an invalid fingerprint if different language', async () => {
    // 1. Send to /v1_preinstall_save_link
    let changedLangHeuristicst = testHeuristics
    changedLangHeuristicst.language = "es-ca"
    changedLangHeuristicst.languages = ["es-ca"]
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(changedLangHeuristicst)

    expect(storeResponse.statusCode).toBe(200)
    expect(storeResponse.body.success).toBe(true)
    expect(storeResponse.body.installId).toBeDefined()

    // 2. Query with /v1_postinstall_search_link
    let newTestFingerprint = testFingerprint
    newTestFingerprint.uniqueMatchLinkToCheck = undefined
    newTestFingerprint.device.languageCode = 'en-US'
    newTestFingerprint.device.languageCodeFromWebView = 'en_US'
    newTestFingerprint.device.languageCodeRaw = 'en_US'
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(testFingerprint)

    expect(matchResponse.statusCode).toBe(200)
    expect(matchResponse.body.match_type).toBe('none')
  })
})

describe('TraceBack associated domain', () => {
  test('should return apple-app-site-association file', async () => {
    // 1. Send to /v1_preinstall_save_link
    const associatedResponse = await request('https://iqbdemocms-traceback.web.app')
      .get('/.well-known/apple-app-site-association')

    expect(associatedResponse.statusCode).toBe(200)
    expect(associatedResponse.body.applinks.details[0].appID).toBe('8X3V795LG6.com.inqbarna.familymealplan')
  })
})

const testFingerprintMissingKey: DeviceFingerprint = {
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
    timezone: 'Europe/London'
  }
};

describe('TraceBack API Integration corner case', () => {
  test('missing fingerPrint Key', async () => {
    // 1. Send to /v1_preinstall_save_link
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(testHeuristics);

    expect(storeResponse.statusCode).toBe(200);
    expect(storeResponse.body.success).toBe(true);
    expect(storeResponse.body.installId).toBeDefined();

    // 2. Query with /v1_postinstall_search_link
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(testFingerprintMissingKey);

    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('none');
  });
});

// Edge Case Tests for Heuristic Search Improvements
describe('TraceBack Heuristic Search Edge Cases', () => {
  
  // Test 1: Timing edge cases - app install very close to pre-install
  test('should match when app install time is slightly before pre-install (negative timing)', async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Create matching heuristics data
    const matchingHeuristics: DeviceHeuristics = {
      ...testHeuristics,
      clipboard: 'http://127.0.0.1:5002/timing-test-link'
    };
    
    // Store heuristics first
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(matchingHeuristics);
    
    expect(storeResponse.statusCode).toBe(200);
    
    // Test with app install time 10 seconds before pre-install (within our 30s tolerance)
    const fingerprintWithEarlierTime: DeviceFingerprint = {
      ...testFingerprint,
      appInstallationTime: currentTime - 10, // 10 seconds earlier
      uniqueMatchLinkToCheck: undefined, // Force heuristic search
      device: {
        ...testFingerprint.device,
        languageCode: 'en-EN', // Match the stored language
        languageCodeFromWebView: 'en-EN',
      }
    };
    
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintWithEarlierTime);
    
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('ambiguous'); // Should find match via heuristics
  });

  // Test 2: Timing edge case - beyond tolerance window
  test('should not match when app install time is too far before pre-install', async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    
    const matchingHeuristics2: DeviceHeuristics = {
      ...testHeuristics,
      clipboard: 'http://127.0.0.1:5002/timing-test-link-2'
    };
    
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(matchingHeuristics2);
    
    expect(storeResponse.statusCode).toBe(200);
    
    // Test with app install time 60 seconds before pre-install (beyond 30s tolerance)
    const fingerprintTooEarly: DeviceFingerprint = {
      ...testFingerprint,
      appInstallationTime: currentTime - 60,
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...testFingerprint.device,
        languageCode: 'en-EN', // Match the stored language
        languageCodeFromWebView: 'en-EN',
      }
    };
    
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintTooEarly);
    
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('none'); // Should not match
  });

  // Test 3: User Agent variations - different formats but same device
  test('should match with slightly different user agent formats', async () => {
    const heuristicsWithUA: DeviceHeuristics = {
      ...testHeuristics,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
      clipboard: 'http://127.0.0.1:5002/ua-test-link'
    };
    
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('User-Agent', heuristicsWithUA.userAgent)
      .send(heuristicsWithUA);
    
    expect(storeResponse.statusCode).toBe(200);
    
    // Different but compatible user agent format
    const fingerprintDiffUA: DeviceFingerprint = {
      ...testFingerprint,
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...testFingerprint.device,
        appVersionFromWebView: 'iqbdemocms/1.0 (iOS 17.4; iPhone15,3)', // Different format but same device
      }
    };
    
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('User-Agent', 'iqbdemocms/1.0 (iOS 17.4; iPhone15,3)')
      .send(fingerprintDiffUA);
    
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('ambiguous');
  });

  // Test 4: IP Address changes (common in mobile networks)
  test('should still match when IP address changes between pre/post install', async () => {
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('X-Forwarded-For', '192.168.1.100') // WiFi IP
      .send({...testHeuristics, clipboard: 'http://127.0.0.1:5002/ip-test-link'});
    
    expect(storeResponse.statusCode).toBe(200);
    
    const fingerprintDiffIP: DeviceFingerprint = {
      ...testFingerprint,
      uniqueMatchLinkToCheck: undefined,
    };
    
    // Different IP (cellular network)
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('X-Forwarded-For', '10.0.0.50')
      .send(fingerprintDiffIP);
    
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('ambiguous'); // Should still match via other signals
  });

  // Test 5: Device model variations (iPhone15,3 vs iPhone 14 Pro vs similar models)
  test('should handle device model variations correctly', async () => {
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send({...testHeuristics, clipboard: 'http://127.0.0.1:5002/device-test-link'});
    
    expect(storeResponse.statusCode).toBe(200);
    
    // Slightly different device model but same specs
    const fingerprintSimilarDevice: DeviceFingerprint = {
      ...testFingerprint,
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...testFingerprint.device,
        deviceModelName: 'iPhone15,2', // Similar but not identical model
      }
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
      ...testHeuristics,
      timezone: 'EUROPE/LONDON', // Upper case
      clipboard: 'http://127.0.0.1:5002/timezone-test-link'
    };
    
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(heuristicsUpperCase);
    
    expect(storeResponse.statusCode).toBe(200);
    
    const fingerprintLowerCase: DeviceFingerprint = {
      ...testFingerprint,
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...testFingerprint.device,
        timezone: 'europe/london', // Lower case
        languageCode: 'en-EN', // Match the stored language
        languageCodeFromWebView: 'en-EN',
      }
    };
    
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintLowerCase);
    
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('ambiguous'); // Should match (case-insensitive)
  });

  // Test 7: Language code variations (_  vs - separator)
  test('should handle language code format variations', async () => {
    const heuristicsUnderscore: DeviceHeuristics = {
      ...testHeuristics,
      language: 'en_US', // Underscore format
      languages: ['en_US'],
      clipboard: 'http://127.0.0.1:5002/lang-test-link'
    };
    
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(heuristicsUnderscore);
    
    expect(storeResponse.statusCode).toBe(200);
    
    const fingerprintDash: DeviceFingerprint = {
      ...testFingerprint,
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...testFingerprint.device,
        languageCode: 'en-US', // Dash format
        languageCodeFromWebView: 'en-US',
      }
    };
    
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintDash);
    
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('ambiguous'); // Should match (normalized)
  });

  // Test 8: Multiple potential matches - scoring system
  test('should pick best match when multiple similar entries exist', async () => {
    // Create first entry with partial match
    const heuristics1: DeviceHeuristics = {
      ...testHeuristics,
      language: 'es-ES', // Different language
      clipboard: 'http://127.0.0.1:5002/multi-test-link-1'
    };
    
    const store1Response = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send(heuristics1);
    expect(store1Response.statusCode).toBe(200);
    
    // Wait a moment to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create second entry with better match
    const heuristics2: DeviceHeuristics = {
      ...testHeuristics,
      clipboard: 'http://127.0.0.1:5002/multi-test-link-2'
    };
    
    const store2Response = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('User-Agent', testHeuristics.userAgent)
      .send(heuristics2);
    expect(store2Response.statusCode).toBe(200);
    
    // Search should find the better match
    const fingerprintMultiMatch: DeviceFingerprint = {
      ...testFingerprint,
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

  // Test 9: Screen resolution edge case - common mobile resolutions
  test('should not match with different screen resolutions', async () => {
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .send({...testHeuristics, clipboard: 'http://127.0.0.1:5002/resolution-test-link'});
    
    expect(storeResponse.statusCode).toBe(200);
    
    const fingerprintDiffResolution: DeviceFingerprint = {
      ...testFingerprint,
      uniqueMatchLinkToCheck: undefined,
      device: {
        ...testFingerprint.device,
        screenResolutionWidth: 414, // Different resolution (iPhone 11)
        screenResolutionHeight: 896,
      }
    };
    
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .send(fingerprintDiffResolution);
    
    expect(matchResponse.statusCode).toBe(200);
    expect(matchResponse.body.match_type).toBe('none'); // Should fail due to resolution mismatch
  });

  // Test 10: OS Version matching with minor differences
  test('should handle OS version variations correctly', async () => {
    const heuristicsOS: DeviceHeuristics = {
      ...testHeuristics,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)', // Specific patch version
      clipboard: 'http://127.0.0.1:5002/os-test-link'
    };
    
    const storeResponse = await request(HOST_BASE_URL)
      .post('/v1_preinstall_save_link')
      .set('User-Agent', heuristicsOS.userAgent)
      .send(heuristicsOS);
    
    expect(storeResponse.statusCode).toBe(200);
    
    const fingerprintDiffOSPatch: DeviceFingerprint = {
      ...testFingerprint,
      uniqueMatchLinkToCheck: undefined,
      osVersion: '17.4.2', // Different patch version
    };
    
    const matchResponse = await request(HOST_BASE_URL)
      .post('/v1_postinstall_search_link')
      .set('User-Agent', 'iqbdemocms/1.0 (iOS 17.4; iPhone15,3)')
      .send(fingerprintDiffOSPatch);
    
    expect(matchResponse.statusCode).toBe(200);
    // Should still match due to major version compatibility
    expect(matchResponse.body.match_type).toBe('ambiguous');
  });
});

describe('TraceBack API Integration doctor', () => {
  test('Doctor endpoint success', async () => {
    // 1. Send to /v1_preinstall_save_link
    const doctorResponse = await request(HOST_BASE_URL).get('/v1_doctor').send();

    expect(doctorResponse.statusCode).toBe(200);
    expect(doctorResponse.body.extensionInitialization).toBeDefined()
    expect(doctorResponse.body.extensionInitialization.siteAlreadyExisted).toBe(true);
  });
});
