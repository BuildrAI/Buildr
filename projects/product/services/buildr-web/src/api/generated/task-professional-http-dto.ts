/* eslint-disable */
// Generated from Task Professional HTTP JSON Schema. Do not edit.
// Run: npm run contracts:professional:generate
// Source Schema Identity: sha256-9b467247578bc8492340b0ada7ce22e6bb8d9dc6129677f0bade527058d96c53

export interface TaskProfessionalHttpDtoProjection {
  overviewRequest: OverviewRequest;
  overviewResponse: OverviewResponse;
  reviewsRequest: ReviewsRequest;
  reviewsResponse: ReviewsResponse;
  verificationRequest: VerificationRequest;
  verificationResponse: VerificationResponse;
  coordinationRequest: CoordinationRequest;
  coordinationResponse: CoordinationResponse;
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
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type TaskProfessionalErrorResponse = TaskProfessionalHttpDtoProjection['errorResponse'];
