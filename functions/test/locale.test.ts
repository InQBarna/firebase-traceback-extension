import {
  resolveCountryFromAcceptLanguage,
  resolveLocale,
} from '../src/common/locale';

describe('resolveCountryFromAcceptLanguage', () => {
  test('extracts the region from a full locale tag', () => {
    expect(resolveCountryFromAcceptLanguage('es-ES,es;q=0.9,en;q=0.8')).toBe(
      'es',
    );
  });

  test('extracts the region from a simple locale tag', () => {
    expect(resolveCountryFromAcceptLanguage('en-US')).toBe('us');
  });

  test('picks the first (primary) locale when multiple are offered', () => {
    expect(
      resolveCountryFromAcceptLanguage(
        'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7',
      ),
    ).toBe('ch');
  });

  test('falls back to us when there is no region subtag', () => {
    expect(resolveCountryFromAcceptLanguage('en')).toBe('us');
  });

  test('falls back to us when the header is missing', () => {
    expect(resolveCountryFromAcceptLanguage(undefined)).toBe('us');
  });

  test('falls back to us when the header is empty', () => {
    expect(resolveCountryFromAcceptLanguage('')).toBe('us');
  });

  test('falls back to us for a script subtag it cannot interpret as a region', () => {
    expect(resolveCountryFromAcceptLanguage('zh-Hant-TW')).toBe('us');
  });

  test('handles an array-valued header (uses the first entry)', () => {
    expect(resolveCountryFromAcceptLanguage(['de-DE,de;q=0.9'])).toBe('de');
  });
});

describe('resolveLocale', () => {
  test('splits language and region when they differ (British English)', () => {
    // The exact case that was broken before the split: 'gb' is a valid
    // region but not a valid ISO language code, so it must never be used
    // for Play Store's `hl` param.
    expect(resolveLocale('en-GB,en;q=0.9')).toEqual({
      language: 'en',
      country: 'gb',
    });
  });

  test('splits language and region when they differ (French Switzerland)', () => {
    expect(resolveLocale('fr-CH,fr;q=0.9')).toEqual({
      language: 'fr',
      country: 'ch',
    });
  });

  test('falls back to English/US when there is no region subtag', () => {
    expect(resolveLocale('en')).toEqual({ language: 'en', country: 'us' });
  });

  test('still extracts a valid language even when the region is unparseable', () => {
    // "Hant" is a script subtag, not a 2-letter region — country falls back,
    // but the language ("zh") is still valid and should be kept.
    expect(resolveLocale('zh-Hant-TW')).toEqual({
      language: 'zh',
      country: 'us',
    });
  });

  test('falls back entirely when the header is missing', () => {
    expect(resolveLocale(undefined)).toEqual({ language: 'en', country: 'us' });
  });
});
