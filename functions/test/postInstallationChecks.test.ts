import * as request from 'supertest'
import { DeviceHeuristics, DeviceFingerprint } from '../src/installs/types'

const HOST_BASE_URL = process.env.TRACEBACK_API_URL ?? 'http://localhost:5002';

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

