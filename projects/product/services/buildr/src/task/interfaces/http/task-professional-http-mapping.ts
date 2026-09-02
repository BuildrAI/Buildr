// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
function present(input, field) {
  return Object.hasOwn(input, field) ? { [field]: input[field] } : {};
}

export function mapTaskProfessionalReadRequest(input = {}) {
  return Object.freeze({});
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
  return Object.freeze({ taskId: input.taskId });
}
