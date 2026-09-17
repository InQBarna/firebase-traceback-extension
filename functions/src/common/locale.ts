export interface ResolvedLocale {
  /** Primary language subtag, e.g. "en" from "en-GB". Defaults to "en". */
  language: string;
  /** Best-guess App/Play Store region, e.g. "gb" from "en-GB". Defaults to "us". */
  country: string;
}

const DEFAULT_LOCALE: ResolvedLocale = { language: 'en', country: 'us' };

/**
 * Resolves a language + App/Play Store region from the visitor's
 * `Accept-Language` header (e.g. "es-ES,es;q=0.9,en;q=0.8" -> { language:
 * "es", country: "es" }).
 *
 * We have no way to know which countries a given app is actually published
 * in, so `country` is only a best guess from the browser's primary locale.
 * Callers are expected to fall back to 'us' if the lookup for this country
 * comes back empty (see appstore.ts / playstore.ts).
 */
export function resolveLocale(
  acceptLanguage: string | string[] | undefined,
): ResolvedLocale {
  const header = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage;
  if (!header) return DEFAULT_LOCALE;

  const primary = header.split(',')[0]?.split(';')[0]?.trim();
  if (!primary) return DEFAULT_LOCALE;

  const [langPart, regionPart] = primary.split('-');

  const language =
    langPart && /^[A-Za-z]{2,3}$/.test(langPart)
      ? langPart.toLowerCase()
      : DEFAULT_LOCALE.language;
  const country =
    regionPart && /^[A-Za-z]{2}$/.test(regionPart)
      ? regionPart.toLowerCase()
      : DEFAULT_LOCALE.country;

  return { language, country };
}

/** Convenience wrapper around resolveLocale for callers that only need the region (e.g. getAppStoreInfo). */
export function resolveCountryFromAcceptLanguage(
  acceptLanguage: string | string[] | undefined,
): string {
  return resolveLocale(acceptLanguage).country;
}
