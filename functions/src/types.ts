import { Timestamp } from 'firebase-admin/firestore';

export default interface DynamicLink {
  id?: string;
  path: string;
  title?: string;
  description?: string;
  image?: string;
  followLink?: string;
  expires?: Timestamp;
  appleAffiliateToken?: string; // Maps to 'at' param
  appleCampaignText?: string; // Maps to 'ct' param
  appleMediaType?: string; // Maps to 'mt' param
  appleProviderId?: string; // Maps to 'pt' param
}

export interface APIKey {
  value: string;
  description: string;
  createdAt?: Timestamp;
}
