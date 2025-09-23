import { Timestamp } from 'firebase-admin/firestore';

export interface DeviceFingerprint {
  appInstallationTime: number;
  bundleId: string;
  osVersion: string;
  sdkVersion: string;
  uniqueMatchLinkToCheck?: string;
  device: DeviceInfo;
}

export interface DeviceInfo {
  deviceModelName: string;
  languageCode: string;
  languageCodeFromWebView?: string;
  languageCodeRaw: string;
  appVersionFromWebView?: string;
  screenResolutionWidth: number;
  screenResolutionHeight: number;
  timezone: string;
}

export interface TraceBackMatchResponse {
  deep_link_id?: string;
  match_message: string;
  match_type: 'unique' | 'heuristics' | 'ambiguous' | 'none';
  request_ip_version: 'IP_V4' | 'IP_V6';
  utm_medium?: string;
  utm_source?: string;
}

export interface DeviceHeuristics {
  language: string;
  languages: string[];
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  platform: string;
  userAgent: string;
  connectionType?: string;
  hardwareConcurrency?: number;
  memory?: number;
  colorDepth?: number;
  clipboard: string;
}

export interface SavedDeviceHeuristics extends DeviceHeuristics {
  createdAt: Timestamp;
  ip?: string;
}
