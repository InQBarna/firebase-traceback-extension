import { Timestamp } from 'firebase-admin/firestore';

export default interface DynamicLink {
  id?: string;
  path: string;
  title?: string;
  description?: string;
  image?: string;
  followLink?: string;
  expires?: Timestamp;
}

export interface APIKey {
  value: string;
  description: string;
  createdAt?: Timestamp;
}
