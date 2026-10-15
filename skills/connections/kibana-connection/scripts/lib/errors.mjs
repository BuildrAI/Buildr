export function connectionFailure(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

export function inputObject(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw connectionFailure('kibana_input_invalid', '请求包含无效字段。');
  }
  return value;
}

export function passwordInput(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 4096 || value.includes('\0')) {
    throw connectionFailure('kibana_authentication_invalid', '完整认证组中的密码无效。');
  }
  return value;
}
