import crypto from 'node:crypto';

const BUILD_TASK_TRAILER = /^Buildr-Task:\s*(.*)$/;

function digest(message) {
  return `sha256-${crypto.createHash('sha256').update(message).digest('hex')}`;
}

function deliveryCommitError(code, message) {
  return Object.assign(new Error(message), {
    code,
    status: 400,
    nextAction: 'Provide a semantic commit message based on the final delivered content, then retry Task Finish.',
  });
}

function normalizeLines(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim().split('\n');
}

function withoutTrailingTaskTrailers(lines) {
  const normalized = [...lines];
  while (normalized.length > 0 && normalized.at(-1).trim() === '') normalized.pop();
  while (normalized.length > 0 && BUILD_TASK_TRAILER.test(normalized.at(-1))) {
    normalized.pop();
    while (normalized.length > 0 && normalized.at(-1).trim() === '') normalized.pop();
  }
  return normalized;
}

export function taskFinishDeliveryCommitFromMessage(message, { legacy = false } = {}) {
  const normalized = String(message ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  const subject = normalized.split('\n', 1)[0]?.trim() || '';
  return {
    message: normalized,
    subject,
    identity: digest(normalized),
    ...(legacy ? { legacy: true } : {}),
  };
}

export function normalizeTaskFinishDeliveryCommit(value, task) {
  const taskId = String(task || '').trim();
  if (!taskId) throw deliveryCommitError('task_finish.commit_message_invalid', 'Task Finish requires a Task ID before normalizing the delivery commit message.');
  if (value == null) throw deliveryCommitError('task_finish.commit_message_required', 'A semantic --commit-message is required before starting a new Task Finish run.');
  const lines = withoutTrailingTaskTrailers(normalizeLines(value));
  const subject = lines[0]?.trim() || '';
  if (!subject) throw deliveryCommitError('task_finish.commit_message_subject_required', 'Task Finish commit message requires a non-empty subject.');
  if (subject === `交付 ${taskId}`) throw deliveryCommitError('task_finish.commit_message_placeholder', 'Task Finish commit subject must describe the delivered content instead of using the Task ID placeholder.');
  const message = `${lines.join('\n').trim()}\n\nBuildr-Task: ${taskId}`;
  return taskFinishDeliveryCommitFromMessage(message);
}

export function legacyTaskFinishDeliveryCommit(task, message = null) {
  return taskFinishDeliveryCommitFromMessage(message ?? `交付 ${task}`, { legacy: true });
}

export function publicTaskFinishDeliveryCommit(value) {
  if (!value?.subject || !value?.identity) return null;
  return { subject: value.subject, identity: value.identity };
}

export function taskFinishDeliveryCommitMatches(expected, actualMessage) {
  if (!expected?.identity) return { matches: true, observed: null };
  const observed = taskFinishDeliveryCommitFromMessage(actualMessage);
  return { matches: expected.identity === observed.identity && expected.subject === observed.subject, observed };
}
