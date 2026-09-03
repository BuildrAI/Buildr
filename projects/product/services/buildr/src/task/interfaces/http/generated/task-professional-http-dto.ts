/* eslint-disable */
// Generated from Task Professional HTTP JSON Schema. Do not edit.
// Run: npm run contracts:professional:generate
// Source Schema Identity: sha256-d0bd6f048b25badd576a9c2b09406983ce6e2e5686000b538af87189fc18001c

export interface TaskProfessionalHttpDtoProjection {
  reviewsRequest: ReviewsRequest;
  reviewsResponse: ReviewsResponse;
  verificationRequest: VerificationRequest;
  verificationResponse: VerificationResponse;
  coordinationRequest: CoordinationRequest;
  coordinationResponse: CoordinationResponse;
  errorResponse: ErrorResponse;
}
export interface ReviewsRequest {}
export interface ReviewsResponse {
  schemaVersion: string;
  operation: string;
  status: string;
  taskId: string;
  diagnostic: null;
  effects: {}[];
  nextActions: string[];
  slots: {
    planning: {
      path: string;
      present: boolean;
      result: {
        schemaVersion: 'buildr.task-review-result/v2';
        taskId: string;
        reviewType: 'planning' | 'completion';
        subjectIdentity: string;
        method: 'self' | 'independent-agent' | 'human';
        reviewed: string[];
        uncovered: {
          subject: string;
          reason: string;
        }[];
        findings: string[];
        conclusion: {
          outcome: 'accepted' | 'changes-requested';
          summary: string;
        };
        completedAt: string;
      } | null;
      resultDigest: string | null;
      observedAt?: string | null;
    };
    completion: {
      path: string;
      present: boolean;
      result: {
        schemaVersion: 'buildr.task-review-result/v2';
        taskId: string;
        reviewType: 'planning' | 'completion';
        subjectIdentity: string;
        method: 'self' | 'independent-agent' | 'human';
        reviewed: string[];
        uncovered: {
          subject: string;
          reason: string;
        }[];
        findings: string[];
        conclusion: {
          outcome: 'accepted' | 'changes-requested';
          summary: string;
        };
        completedAt: string;
      } | null;
      resultDigest: string | null;
      observedAt?: string | null;
    };
  };
}
export interface VerificationRequest {}
export interface VerificationResponse {
  schemaVersion: string;
  operation: string;
  status: string;
  taskId: string;
  diagnostic: null;
  effects: {}[];
  nextActions: string[];
  slot: {
    path: string;
    present: boolean;
    report: {
      schemaVersion: 'buildr.task-verification-report/v1';
      taskId: string;
      scope: {
        projects: string[];
        services: {
          project: string;
          service: string;
        }[];
      };
      content: {
        identity: string;
        summary: string;
      };
      declarations: {
        project: string;
        path: string;
        identity: string;
        status: 'ready' | 'absent' | 'invalid';
        summary?: string;
      }[];
      checks: {
        id: string;
        project: string;
        service?: string;
        testing: string;
        selection: 'focus' | 'task-related' | 'full' | 'legacy';
        targets: string[];
        source: 'command' | 'agent' | 'legacy';
        outcome: 'passed' | 'failed';
        summary: string;
        mapStatus: 'declared' | 'map-unavailable';
        durationMs?: number;
      }[];
      gaps: {
        testing: string;
        reason: string;
        project?: string;
        service?: string;
      }[];
      conclusion: {
        outcome: 'passed' | 'not-passed' | 'incomplete';
        summary: string;
      };
      completedAt: string;
    } | null;
    reportDigest: string | null;
    applicability: {
      status: 'current' | 'stale' | 'unknown';
      content: {
        status: 'current' | 'stale' | 'unknown';
      };
      declarations: {
        status: 'current' | 'stale';
      };
      reasons: {
        code: string;
        message: string;
      }[];
    } | null;
    observedAt?: string;
  };
}
export interface CoordinationRequest {}
export interface CoordinationResponse {
  schemaVersion: string;
  operation: string;
  status: string;
  taskId: string;
  recordDigest: string;
  mode: 'parent' | 'child' | 'ordinary';
  parentStatus: 'todo' | 'active' | 'completed' | 'abandoned';
  isParent: boolean;
  objective: string;
  result: null | {
    summary: string;
    parentCompletion?: ParentCompletion;
  };
  parentSource: TaskRecord | null;
  children: {
    taskId: string;
    title: string;
    intent: string;
    status: 'todo' | 'active' | 'completed' | 'abandoned';
    scope: TaskScope;
    isParent: boolean;
    result: null | {
      summary: string;
      parentCompletion?: ParentCompletion;
    };
    updatedAt: string;
  }[];
  completion: {
    snapshotIdentity: string;
    authorizationRequired: boolean;
    openChildTaskIds: string[];
    evidence: ParentCompletion | null;
    summary: string;
  };
  historicalPlan: {
    sourceSchemaVersion: string;
    identity: string;
    outcome: string;
    architectureDecisions: string[];
    contributions: {
      id: string;
      priority: string;
      title: string;
      objective: string;
      directions: string[];
      boundaries: string[];
      expectedChild: string | null;
      dependencies: string[];
    }[];
    finalAcceptance: string[];
  } | null;
  diagnostic: {
    code: string;
    message: string;
  } | null;
  effects: {}[];
}
export interface ParentCompletion {
  expectedSnapshot: string;
  acceptance: {
    summary: string;
    children: {
      taskId: string;
      summary: string;
    }[];
  };
  authorization: {
    source: string;
    statement: string;
  };
  recordedAt?: string;
}
export interface TaskRecord {
  schemaVersion: 'buildr.task-record/v3';
  taskId: string;
  title: string;
  intent: string;
  scope: {
    projects: string[];
    services: QualifiedService[];
  };
  changes: QualifiedChange[];
  parentTaskId: string | null;
  isParent?: boolean;
  retrospective: {
    state: 'pending-decision' | 'decided';
    documentDigest: string;
  } | null;
  status: 'todo' | 'active' | 'completed' | 'abandoned';
  result: null | {
    summary: string;
    parentCompletion?: ParentCompletion;
  };
  resultHistory?: TaskResultHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
export interface QualifiedService {
  project: string;
  service: string;
}
export interface QualifiedChange {
  project: string;
  change: string;
}
export interface TaskResultHistoryEntry {
  status: 'completed' | 'abandoned';
  title: string;
  intent: string;
  parentTaskId: string | null;
  scope?: {
    projects: string[];
    services: QualifiedService[];
  };
  changes?: QualifiedChange[];
  isParent?: true;
  result: null | {
    summary: string;
    parentCompletion?: ParentCompletion;
  };
  recordUpdatedAt: string;
  correctedAt: string;
  reason: string;
}
export interface TaskScope {
  projects: string[];
  services: QualifiedService[];
}
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type TaskProfessionalErrorResponse = TaskProfessionalHttpDtoProjection['errorResponse'];
