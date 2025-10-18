import { Config } from '../config';

/**
 * Get the site ID based on configuration
 * If a custom domain is configured, use that; otherwise use projectID-traceback
 */
export function getSiteId(config: Config): string {
  if (config.domain !== '') {
    return config.domain;
  }
  return `${config.projectID}-traceback`;
}

/**
 * Get the full site name (URL) for the hosting site
 */
export function getSiteName(config: Config): string {
  return `https://${getSiteId(config)}.web.app`;
}
