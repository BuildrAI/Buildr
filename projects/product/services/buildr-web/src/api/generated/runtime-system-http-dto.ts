/* eslint-disable */
// Generated from Runtime/System HTTP JSON Schemas. Do not edit.
// Run: npm run contracts:generate:runtime-system

export interface BuildrWebEmptyRequestBuildrWebEmptyRequest {}
export interface BuildrWebQuitRequestBuildrWebQuitRequest {}
export interface BuildrWebHealthResponseBuildrWebHealthResponse {
  schemaVersion: 'buildr.local-app-health/v1';
  status: 'ready' | 'stopping';
  pid: number;
  launcherIdentity?: {
    [k: string]: unknown | undefined;
  } | null;
  productIdentity?: {
    [k: string]: unknown | undefined;
  } | null;
  webProfile?: {
    [k: string]: unknown | undefined;
  } | null;
  previewIdentity?: {
    [k: string]: unknown | undefined;
  } | null;
}
export interface BuildrWebStoppingResponseBuildrWebStoppingResponse {
  status: 'stopping';
}
export interface BuildrWebErrorResponseBuildrWebErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
export interface ReleaseAwarenessRequestReleaseAwarenessRequest {}
export interface ReleaseAwarenessResponseReleaseAwarenessResponse {
  schemaVersion: 'buildr.release-awareness/v1';
  mode: string;
  channel: string;
  current: {
    version: string;
    [k: string]: unknown | undefined;
  };
  selectedTrack: 'stable' | 'candidate';
  tracks: {
    stable: {
      track: 'stable' | 'candidate';
      tag: string;
      label: string;
      version: string | null;
      observedVersion: string | null;
      status: string;
      available: boolean;
      installable: boolean;
      seen: boolean;
      newlyObserved: boolean;
      notified: boolean;
      shouldNotify: boolean;
    };
    candidate: {
      track: 'stable' | 'candidate';
      tag: string;
      label: string;
      version: string | null;
      observedVersion: string | null;
      status: string;
      available: boolean;
      installable: boolean;
      seen: boolean;
      newlyObserved: boolean;
      notified: boolean;
      shouldNotify: boolean;
    };
  };
  notices: {
    [k: string]: unknown | undefined;
  }[];
  observedAt: string | null;
  freshness: {
    status: string;
    source: string;
    checkedAt: string | null;
  };
  status: string;
  blockingReasons: string[];
  nextActions: string[];
}
export interface SystemInstallationHttpErrorResponseReleaseAwarenessErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
export interface PublicationListRequestPublicationListRequest {}
export interface PublicationDetailRequestPublicationDetailRequest {
  id: string;
}
export interface PublicationAssetRequestPublicationAssetRequest {
  id: string;
  assetPath: string;
}
export interface PublicationListResponsePublicationListResponse {
  schemaVersion: 'buildr.publications/v1';
  publications: {
    id: string;
    title: string;
    kind: string;
    status: string;
    publishedAt: string | null;
    targets: {
      platform: string;
      status: string;
      url?: string;
    }[];
    sourcePath: string;
  }[];
  empty: boolean;
}
export interface PublicationDetailResponsePublicationDetailResponse {
  schemaVersion: 'buildr.publication-detail/v1';
  publication: {
    id: string;
    title: string;
    kind: string;
    status: string;
    publishedAt: string | null;
    targets: {
      platform: string;
      status: string;
      url?: string;
    }[];
    sourcePath: string;
  };
  content: string;
  source: string;
}
export interface PublicationHttpErrorResponsePublicationErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
