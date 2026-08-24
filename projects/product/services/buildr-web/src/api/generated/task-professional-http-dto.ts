/* eslint-disable */
// Generated from Task Professional HTTP JSON Schema. Do not edit.
// Run: npm run contracts:professional:generate
// Source Schema Identity: sha256-c37156882dafd356dc658ab1949e139a7b195e4e46e4281d7f333513a7cd20e2

export interface TaskProfessionalHttpDtoProjection {
  overviewRequest: OverviewRequest;
  overviewResponse: OverviewResponse;
  environmentRequest: EnvironmentRequest;
  environmentResponse: EnvironmentResponse;
  developmentRequest: DevelopmentRequest;
  developmentResponse: DevelopmentResponse;
  reviewsRequest: ReviewsRequest;
  reviewsResponse: ReviewsResponse;
  verificationRequest: VerificationRequest;
  verificationResponse: VerificationResponse;
  coordinationRequest: CoordinationRequest;
  coordinationResponse: CoordinationResponse;
  coordinationPatchRequest: CoordinationPatchRequest;
  executionRecordsRequest: ExecutionRecordsRequest;
  executionRecordsResponse: ExecutionRecordsResponse;
  executionRecordDetailRequest: ExecutionRecordDetailRequest;
  executionRecordDetailResponse: ExecutionRecordDetailResponse;
  executionRecordBodyRequest: ExecutionRecordBodyRequest;
  executionRecordBodyResponse: ExecutionRecordBodyResponse;
  retrospectiveRequest: RetrospectiveRequest;
  retrospectiveResponse: RetrospectiveResponse;
  retrospectivePatchRequest: RetrospectivePatchRequest;
  reviewPromptRequest: ReviewPromptRequest;
  reviewPromptResponse: ReviewPromptResponse;
  verificationPromptRequest: VerificationPromptRequest;
  verificationPromptResponse: VerificationPromptResponse;
  errorResponse: ErrorResponse;
}
export interface OverviewRequest {}
export interface OverviewResponse {
  [k: string]: unknown | undefined;
}
export interface EnvironmentRequest {}
export interface EnvironmentResponse {
  [k: string]: unknown | undefined;
}
export interface DevelopmentRequest {}
export interface DevelopmentResponse {
  [k: string]: unknown | undefined;
}
export interface ReviewsRequest {}
export interface ReviewsResponse {
  [k: string]: unknown | undefined;
}
export interface VerificationRequest {}
export interface VerificationResponse {
  [k: string]: unknown | undefined;
}
export interface CoordinationRequest {}
export interface CoordinationResponse {
  [k: string]: unknown | undefined;
}
export interface CoordinationPatchRequest {
  operation: 'record' | 'reconcile' | 'accept';
  expectedPlanIdentity?: string;
  plan?: {
    [k: string]: unknown | undefined;
  };
  reason?: string;
  summary?: string;
}
export interface ExecutionRecordsRequest {
  view?: 'all' | 'verification' | 'finish';
}
export interface ExecutionRecordsResponse {
  [k: string]: unknown | undefined;
}
export interface ExecutionRecordDetailRequest {
  recordId: string;
}
export interface ExecutionRecordDetailResponse {
  [k: string]: unknown | undefined;
}
export interface ExecutionRecordBodyRequest {
  recordId: string;
  filename: string;
}
export interface ExecutionRecordBodyResponse {
  [k: string]: unknown | undefined;
}
export interface RetrospectiveRequest {}
export interface RetrospectiveResponse {
  [k: string]: unknown | undefined;
}
export interface RetrospectivePatchRequest {
  status?: 'pending' | 'handled' | 'no-action';
  note?: string;
  expectedCurrentDigest: string;
}
export interface ReviewPromptRequest {
  taskId: string;
  reviewType: 'planning' | 'completion';
  projectCode?: string;
  change?: string;
}
export interface ReviewPromptResponse {
  prompt: string;
  copiedMeansRecorded: boolean;
}
export interface VerificationPromptRequest {
  taskId: string;
  targetIdentity?: string;
}
export interface VerificationPromptResponse {
  prompt: string;
  copiedMeansRecorded: boolean;
}
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type TaskProfessionalErrorResponse = TaskProfessionalHttpDtoProjection['errorResponse'];
