import { privateInitialize } from '../src/lifecycle/initialize'
import { Config } from '../src/config'
import * as admin from 'firebase-admin';

describe('privateInitialize', () => {
  test.concurrent(
    'integration test should work when createRemoteHost is true and createExample false',
    async () => {
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
      admin.initializeApp();
      await expect(
        privateInitialize(true, false, config),
      ).resolves.toBeDefined()
    },
    10000,
  );

    /*
    test.concurrent('integration test should work when createRemoteHost is false and createExample false', async () => {
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
        await expect(privateInitialize(false, false, config)).resolves.toBeUndefined()
    }, 10000)
    */
})
