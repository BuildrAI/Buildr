/* eslint-disable */
// Generated from Task Professional HTTP JSON Schema. Do not edit.
// Run: npm run contracts:professional:generate
// Source Schema Identity: sha256-23c326e9bcca3161fb162983d06fd10cc06b7eb5251ae1057d2aa989d8485a7a

export interface TaskProfessionalHttpDtoProjection {
  overviewRequest: OverviewRequest;
  overviewResponse: OverviewResponse;
  reviewsRequest: ReviewsRequest;
  reviewsResponse: ReviewsResponse;
  verificationRequest: VerificationRequest;
  verificationResponse: VerificationResponse;
  coordinationRequest: CoordinationRequest;
  coordinationResponse: CoordinationResponse;
  retrospectiveRequest: RetrospectiveRequest;
  retrospectiveResponse: RetrospectiveResponse;
  retrospectivePatchRequest: RetrospectivePatchRequest;
  errorResponse: ErrorResponse;
}
export interface OverviewRequest {}
export interface OverviewResponse {
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
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type TaskProfessionalErrorResponse = TaskProfessionalHttpDtoProjection['errorResponse'];
