function present(input, field) {
  return Object.hasOwn(input, field) ? { [field]: input[field] } : {};
}

export function mapTaskProfessionalReadRequest(input = {}) {
  return Object.freeze({});
}

export function mapTaskExecutionRecordsRequest(input) {
  return Object.freeze({ view: input.view });
}

export function mapTaskExecutionRecordDetailRequest(recordId) {
  return Object.freeze({ recordId });
}

export function mapTaskExecutionRecordBodyRequest(recordId, filename) {
  return Object.freeze({ recordId, filename });
}

export function mapTaskRetrospectiveRequest(input = {}) {
  return Object.freeze({
    ...present(input, 'status'),
    ...present(input, 'note'),
    expectedCurrentDigest: input.expectedCurrentDigest,
  });
}

export function mapTaskReviewPromptRequest(input) {
  return Object.freeze({
    ...present(input, 'taskId'),
    ...present(input, 'reviewType'),
    ...present(input, 'projectCode'),
    ...present(input, 'change'),
  });
}

export function mapTaskVerificationPromptRequest(input) {
  return Object.freeze({ taskId: input.taskId, ...present(input, 'targetIdentity') });
}

export function mapTaskParentCoordinationRequest(input) {
  return Object.freeze({
    operation: input.operation,
    ...present(input, 'expectedPlanIdentity'),
    ...present(input, 'plan'),
    ...present(input, 'reason'),
    ...present(input, 'summary'),
  });
}
