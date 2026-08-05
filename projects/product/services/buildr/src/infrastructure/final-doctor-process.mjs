import { spawnSync } from './process.mjs';

export const FINAL_DOCTOR_MAX_BUFFER = 4 * 1024 * 1024;
const DIAGNOSTIC_PREVIEW_LIMIT = 16 * 1024;

export function finalDoctorArgs(agent, targetRoot) {
  return ['doctor', '--agent', agent, '--target', targetRoot, '--json', '--detail', 'compact'];
}

function output(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function boundedDiagnostic(result) {
  const detail = output(result);
  if (detail.length <= DIAGNOSTIC_PREVIEW_LIMIT) return detail;
  return `${detail.slice(0, DIAGNOSTIC_PREVIEW_LIMIT)}\n… Doctor diagnostic truncated (${Buffer.byteLength(detail)} bytes).`;
}

export function classifyFinalDoctorResult(result) {
  const errorCode = result?.error?.code || result?.errorCode || null;
  if (errorCode === 'ENOBUFS') {
    return {
      status: 'output-limit-exceeded',
      code: 'doctor.output_limit_exceeded',
      message: `Doctor compact 输出超过内部 ${FINAL_DOCTOR_MAX_BUFFER} bytes 上限。`,
      diagnostic: boundedDiagnostic(result || {}),
    };
  }
  if (errorCode || result?.signal || !Number.isInteger(result?.status)) {
    return {
      status: 'execution-failed',
      code: 'doctor.process_failed',
      message: `Doctor 子进程执行失败${errorCode ? `（${errorCode}）` : result?.signal ? `（signal ${result.signal}）` : ''}。`,
      diagnostic: boundedDiagnostic(result || {}) || result?.error?.message || '',
    };
  }
  if (result.status !== 0) {
    return {
      status: 'doctor-failed',
      code: 'doctor.not-passed',
      message: '最终 Doctor 未通过。',
      diagnostic: boundedDiagnostic(result),
    };
  }
  return { status: 'passed', code: 'doctor.passed', message: '最终 Doctor 通过。', diagnostic: '' };
}

export function runFinalDoctor({ executable, cliPath, agent, targetRoot, cwd, spawn = spawnSync }) {
  const result = spawn(executable, [cliPath, ...finalDoctorArgs(agent, targetRoot)], {
    cwd,
    encoding: 'utf8',
    maxBuffer: FINAL_DOCTOR_MAX_BUFFER,
  });
  return { result, classification: classifyFinalDoctorResult(result) };
}
