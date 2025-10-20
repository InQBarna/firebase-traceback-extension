import * as request from 'supertest';
import {
  getTestApiUrl,
  initializeTestFirebase,
  cleanupTestFirebase,
  createTestApiKey,
  clearApiKeyRecords,
} from './test-utils';
import { API_KEY_HEADER } from '../src/common/constants';

// Initialize Firebase Admin for testing (use default project ID)
initializeTestFirebase();

const HOST_BASE_URL = getTestApiUrl();

describe('Extension Setup - Associated Domain', () => {
  test('should return apple-app-site-association file', async () => {
    const associatedResponse = await request(
      'https://iqbdemocms-traceback.web.app',
    ).get('/.well-known/apple-app-site-association');

    expect(associatedResponse.statusCode).toBe(200);
    expect(associatedResponse.body.applinks.details[0].appID).toBe(
      '8X3V795LG6.com.inqbarna.familymealplan',
    );
  });
});

describe('Extension Setup - Doctor Endpoint', () => {
  let testApiKey: string;

  beforeEach(async () => {
    // Create a test API key before each test
    testApiKey = await createTestApiKey('Test API key for doctor endpoint');
  });

  afterEach(async () => {
    // Clean up API keys after each test
    await clearApiKeyRecords();
  });

  afterAll(async () => {
    await cleanupTestFirebase();
  });

  test('should return success with valid API key', async () => {
    const doctorResponse = await request(HOST_BASE_URL)
      .get('/v1_doctor')
      .set(API_KEY_HEADER, testApiKey)
      .send();

    expect(doctorResponse.statusCode).toBe(200);
    expect(doctorResponse.body.extensionInitialization).toBeDefined();
    expect(doctorResponse.body.extensionInitialization.siteAlreadyExisted).toBe(
      true, // In emulator/demo mode, site doesn't pre-exist
    );
  });

  test('should fail without API key', async () => {
    const doctorResponse = await request(HOST_BASE_URL)
      .get('/v1_doctor')
      .send();

    expect(doctorResponse.statusCode).toBe(401);
    expect(doctorResponse.body.error).toBe('API key required');
  });

  test('should fail with invalid API key', async () => {
    const doctorResponse = await request(HOST_BASE_URL)
      .get('/v1_doctor')
      .set(API_KEY_HEADER, 'invalid-api-key-12345')
      .send();

    expect(doctorResponse.statusCode).toBe(403);
    expect(doctorResponse.body.error).toBe('Invalid API key');
  });
});
