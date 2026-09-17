import axios from 'axios';
import { getAppStoreInfo, AppStoreInfo } from '../src/appstore/appstore';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function itunesResponse(app?: Partial<AppStoreInfo>) {
  return { data: { results: app ? [app] : [] } };
}

/**
 * These tests translate the "AppStore info retrieval" ticket's Given/When/Then
 * scenarios directly into assertions. getPlatformFromUserAgent/preview.ts
 * resolve the visitor's country from Accept-Language (see locale.test.ts) and
 * pass it in here as `country` — this file only covers getAppStoreInfo's own
 * lookup + fallback behavior.
 */
describe('getAppStoreInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GIVEN an iOS client in US, WHEN looking up the app, THEN returns the US storefront info', async () => {
    const usApp: AppStoreInfo = {
      trackName: 'App US',
      description: '',
      trackId: '111',
      artworkUrl100: '',
    };
    mockedAxios.get.mockResolvedValueOnce(itunesResponse(usApp));

    const result = await getAppStoreInfo('com.example.app.us', 'us');

    expect(result).toEqual(usApp);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('country=us'),
    );
  });

  test('GIVEN an iOS client in country XX, WHEN looking up the app, THEN returns the XX storefront info', async () => {
    const xxApp: AppStoreInfo = {
      trackName: 'App XX',
      description: '',
      trackId: '222',
      artworkUrl100: '',
    };
    mockedAxios.get.mockResolvedValueOnce(itunesResponse(xxApp));

    const result = await getAppStoreInfo('com.example.app.xx', 'xx');

    expect(result).toEqual(xxApp);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('country=xx'),
    );
  });

  test('GIVEN an app only available in US, AND a client in country XX, WHEN looking up the app, THEN falls back to the US storefront info', async () => {
    const usApp: AppStoreInfo = {
      trackName: 'App US-only',
      description: '',
      trackId: '333',
      artworkUrl100: '',
    };
    mockedAxios.get
      .mockResolvedValueOnce(itunesResponse(undefined)) // xx: not found
      .mockResolvedValueOnce(itunesResponse(usApp)); // us: found

    const result = await getAppStoreInfo('com.example.app.usonly', 'xx');

    expect(result).toEqual(usApp);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('country=xx'),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('country=us'),
    );
  });

  test('GIVEN an app only available in country XX, AND a client in country XX, WHEN looking up the app, THEN returns the XX storefront info without falling back', async () => {
    const xxApp: AppStoreInfo = {
      trackName: 'App XX-only',
      description: '',
      trackId: '444',
      artworkUrl100: '',
    };
    mockedAxios.get.mockResolvedValueOnce(itunesResponse(xxApp));

    const result = await getAppStoreInfo('com.example.app.xxonly', 'xx');

    expect(result).toEqual(xxApp);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  test('GIVEN an app only available in country XX, AND a client in country YY, WHEN looking up the app, THEN falls back to US and returns nothing there either — documented limitation: we cannot detect that the app lives in XX from a YY visitor, since there is no API to list an app\'s available countries', async () => {
    mockedAxios.get
      .mockResolvedValueOnce(itunesResponse(undefined)) // yy: not found
      .mockResolvedValueOnce(itunesResponse(undefined)); // us: not found either

    const result = await getAppStoreInfo('com.example.app.xxonly2', 'yy');

    expect(result).toBeUndefined();
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('country=yy'),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('country=us'),
    );
  });

  test('does not fall back again when the requested country is already us', async () => {
    mockedAxios.get.mockResolvedValueOnce(itunesResponse(undefined));

    const result = await getAppStoreInfo('com.example.app.notfound', 'us');

    expect(result).toBeUndefined();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  test('caches a "not found" result so a repeat lookup for the same bundle+country does not re-query iTunes', async () => {
    mockedAxios.get.mockResolvedValueOnce(itunesResponse(undefined));

    const bundleId = 'com.example.app.negativecache';
    const first = await getAppStoreInfo(bundleId, 'us');
    const second = await getAppStoreInfo(bundleId, 'us');

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});
