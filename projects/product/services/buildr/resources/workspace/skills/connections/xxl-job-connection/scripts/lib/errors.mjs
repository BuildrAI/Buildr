export function connectionFailure(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
export function inputObject(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw connectionFailure('xxl_job_input_invalid', '请求包含无效或未知字段。');
  return value;
}
export function passwordInput(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 4096 || value.includes('\0')) throw connectionFailure('xxl_job_password_invalid', '密码输入无效。');
  return value;
}
