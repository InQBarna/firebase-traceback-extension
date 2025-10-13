import DynamicLink from '../types';

/**
 * Sample dynamic link that gets created when the extension is initialized
 * This serves as an example for users to understand how to create dynamic links
 */
export const getSampleLink = (siteId: string): DynamicLink => ({
  path: '/example',
  title: 'Example Dynamic Link',
  description:
    'This is a sample dynamic link created during extension initialization',
  followLink: 'https://example.com/products/sample',
  image: `https://${siteId}.web.app/images/thumb.jpg`,
});

/**
 * Additional sample links for testing and development
 */
export const additionalSampleLinks: Omit<DynamicLink, 'image'>[] = [
  {
    path: '/summer',
    title: 'Summer Sale Campaign',
    description: 'Promotional link for summer sale',
    followLink: 'https://example.com/products/summer-sale',
  },
  {
    path: '/features',
    title: 'New Features Announcement',
    description: 'Blog post about latest features',
    followLink: 'https://example.com/blog/new-features',
  },
  {
    path: '/onboard',
    title: 'User Onboarding Flow',
    description: 'Deep link for new user onboarding',
    followLink: 'https://example.com/app/onboarding',
  },
  {
    path: '/prod12345',
    title: 'Product #12345',
    description: 'Direct link to product page',
    followLink: 'https://example.com/products/item/12345',
  },
  {
    path: '/ref-abc',
    title: 'Referral Code ABC123',
    description: 'Referral link for user acquisition',
    followLink: 'https://example.com/referral?code=ABC123',
  },
];
