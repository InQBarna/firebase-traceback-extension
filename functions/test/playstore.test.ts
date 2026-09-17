import axios from 'axios';
import { getPlayStoreInfo } from '../src/appstore/playstore';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function ogHtml(fields?: { title: string; description?: string; image?: string }) {
  if (!fields) return { data: '<html><head></head><body>Not available</body></html>' };
  return {
    data: `<html><head>
      <meta property="og:title" content="${fields.title}" />
      <meta property="og:description" content="${fields.description ?? ''}" />
      <meta property="og:image" content="${fields.image ?? ''}" />
    </head></html>`,
  };
}

/** Same fallback pattern as getAppStoreInfo (see appstore.test.ts), applied to Play Store via the `gl` region param. `hl` (language) and `gl` (region) are resolved separately — see locale.test.ts. */
describe('getPlayStoreInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requests hl=language and gl=REGION separately, and returns the app info when found', async () => {
    mockedAxios.get.mockResolvedValueOnce(ogHtml({ title: 'App XX' }));

    const result = await getPlayStoreInfo('com.example.app.playxx', 'fr', 'xx');

    expect(result?.trackName).toBe('App XX');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringMatching(/hl=fr(&|$)/),
      expect.anything(),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('gl=XX'),
      expect.anything(),
    );
  });

  test('falls back to the US region when the app is not found in the requested region, keeping the visitor\'s language', async () => {
    mockedAxios.get
      .mockResolvedValueOnce(ogHtml(undefined)) // xx: not found
      .mockResolvedValueOnce(ogHtml({ title: 'App US-only' })); // us: found

    const result = await getPlayStoreInfo(
      'com.example.app.playusonly',
      'fr',
      'xx',
    );

    expect(result?.trackName).toBe('App US-only');
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('gl=XX'),
      expect.anything(),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/hl=fr(&|$)/),
      expect.anything(),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('gl=US'),
      expect.anything(),
    );
  });

  test('does not fall back again when the requested region is already us', async () => {
    mockedAxios.get.mockResolvedValueOnce(ogHtml(undefined));

    const result = await getPlayStoreInfo(
      'com.example.app.playnotfound',
      'en',
      'us',
    );

    expect(result).toBeUndefined();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  test('caches a "not found" result so a repeat lookup does not re-scrape Play Store', async () => {
    mockedAxios.get.mockResolvedValueOnce(ogHtml(undefined));

    const packageName = 'com.example.app.playnegativecache';
    const first = await getPlayStoreInfo(packageName, 'en', 'us');
    const second = await getPlayStoreInfo(packageName, 'en', 'us');

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});
