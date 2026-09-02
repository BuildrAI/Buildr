/* eslint-disable */
// Generated from Task Professional HTTP JSON Schema. Do not edit.
// Run: npm run contracts:professional:generate
// Source Schema Identity: sha256-123153c2077c0a3bf9feb8a7f75c0a41b1d650c8ffa0b03a3f536b5cdf4ec945

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
  retrospectiveRequest: RetrospectiveRequest;
  retrospectiveResponse: RetrospectiveResponse;
  retrospectivePatchRequest: RetrospectivePatchRequest;
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
export interface RetrospectiveRequest {}
export interface RetrospectiveResponse {
  [k: string]: unknown | undefined;
}
export interface RetrospectivePatchRequest {
  status?: 'pending' | 'handled' | 'no-action';
  note?: string;
  expectedCurrentDigest: string;
}
export interface VerificationPromptRequest {
  taskId: string;
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
