import { privateInitialize } from '../src/lifecycle/initialize';
import { Config } from '../src/config';

// Mock Firebase Admin to avoid real API calls
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          add: jest.fn().mockResolvedValue({ id: 'mock-doc-id' }),
        })),
      })),
    })),
  })),
}));

// Mock axios to avoid real HTTP requests
jest.mock('axios', () => ({
  default: {
    get: jest.fn().mockResolvedValue({ status: 200, data: 'OK' }),
  },
}));

// Mock the FirebaseService
jest.mock('../src/firebase-service', () => ({
  FirebaseService: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    getSiteId: jest.fn().mockResolvedValue('mock-site-id'),
    createNewWebsite: jest.fn().mockResolvedValue({
      alreadyConfigured: false,
      siteId: 'mock-site-id',
    }),
    createNewVersion: jest.fn().mockResolvedValue('mock-version-id'),
    finalizeVersion: jest.fn().mockResolvedValue(undefined),
    deployVersion: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('privateInitialize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should work when createRemoteHost is true', async () => {
    const config: Config = {
      projectID: 'iqbdemocms',
      extensionID: 'traceback',
      location: 'europe-west1',
      iosBundleID: 'com.inqbarna.familymealplan',
      iosTeamID: '8X3V795LG6',
      androidBundleID: 'org.sagradafamilia.droid',
      androidSHA:
        '14:88:35:8A:39:C2:12:D2:44:02:EA:A5:F2:88:53:AB:82:98:DA:B4:6D:D5:8A:42:F2:11:B7:AD:F3:F2:7B:41',
      androidScheme: 'org.sagradafamilia.droid',
      domain: '',
    };

    const result = await privateInitialize(true, config);

    expect(result).toBeDefined();
    expect(result.siteAlreadyExisted).toBe(false);
    expect(result.siteCreatedViaAPI).toBe(true);
    expect(result.siteName).toBe('https://mock-site-id.web.app');
    expect(result.error).toBeUndefined();
  });

  /*
    test.concurrent('integration test should work when createRemoteHost is false', async () => {
        const config: Config = {
            projectID: 'iqbdemocms',
            extensionID: 'traceback',
            location: 'europe-west1',
            iosBundleID: 'com.inqbarna.familymealplan',
            iosTeamID: '8X3V795LG6',
            androidBundleID: 'org.sagradafamilia.droid',
            androidSHA: '14:88:35:8A:39:C2:12:D2:44:02:EA:A5:F2:88:53:AB:82:98:DA:B4:6D:D5:8A:42:F2:11:B7:AD:F3:F2:7B:41',
            androidScheme: 'org.sagradafamilia.droid',
            domain: 'demo-test-project-traceback',
        };
        admin.initializeApp()
        await expect(privateInitialize(false, config)).resolves.toBeUndefined()
    }, 10000)
    */
});
