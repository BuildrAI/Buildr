import { connectionFailure, inputObject } from './connection.ts';
import { xxlJobInteger, xxlJobText } from './xxl-job-connection.ts';
import type { XxlJobDetail, XxlJobEditable, XxlJobFieldsInput } from './xxl-job-types.ts';

export const XXL_JOB_EDITABLE_FIELDS = ['jobDesc', 'author', 'alarmEmail', 'scheduleType', 'scheduleConf', 'executorHandler', 'executorParam', 'executorRouteStrategy', 'executorBlockStrategy', 'executorTimeout', 'executorFailRetryCount', 'misfireStrategy', 'childJobId'] as const;
export const XXL_JOB_DEFAULTS = { alarmEmail: '', scheduleType: 'NONE', scheduleConf: '', executorParam: '', executorRouteStrategy: 'FIRST', executorBlockStrategy: 'SERIAL_EXECUTION', executorTimeout: 0, executorFailRetryCount: 0, misfireStrategy: 'DO_NOTHING', childJobId: '' } as const;
function normalize(fields: Record<string, unknown>): XxlJobEditable {
  const scheduleType = fields.scheduleType;
  if (!['NONE', 'CRON', 'FIX_RATE'].includes(String(scheduleType))) throw connectionFailure('xxl_job_input_invalid', '调度类型只支持 NONE、CRON 或 FIX_RATE。');
  const scheduleConf = xxlJobText(fields.scheduleConf, '调度配置', 128, scheduleType === 'NONE');
  if (scheduleType === 'FIX_RATE' && (!/^[1-9]\d*$/u.test(scheduleConf) || Number(scheduleConf) > 2_147_483_647)) throw connectionFailure('xxl_job_input_invalid', '固定频率必须为正整数秒。');
  const route = xxlJobText(fields.executorRouteStrategy, '路由策略', 64);
  if (!['FIRST', 'LAST', 'ROUND', 'RANDOM', 'CONSISTENT_HASH', 'LEAST_FREQUENTLY_USED', 'LEAST_RECENTLY_USED', 'FAILOVER', 'BUSYOVER', 'SHARDING_BROADCAST'].includes(route)) throw connectionFailure('xxl_job_input_invalid', '路由策略不受支持。');
  const block = xxlJobText(fields.executorBlockStrategy, '阻塞策略', 64);
  if (!['SERIAL_EXECUTION', 'DISCARD_LATER', 'COVER_EARLY'].includes(block)) throw connectionFailure('xxl_job_input_invalid', '阻塞策略不受支持。');
  const misfire = xxlJobText(fields.misfireStrategy, '过期策略', 64);
  if (!['DO_NOTHING', 'FIRE_ONCE_NOW'].includes(misfire)) throw connectionFailure('xxl_job_input_invalid', '过期策略不受支持。');
  const childJobId = xxlJobText(fields.childJobId, '子任务编号', 255, true);
  if (childJobId && !/^[1-9]\d*(?:,[1-9]\d*)*$/u.test(childJobId)) throw connectionFailure('xxl_job_input_invalid', '子任务编号必须为逗号分隔的正整数。');
  if (childJobId) childJobId.split(',').forEach(id => xxlJobInteger(Number(id), '子任务编号'));
  return {
    jobDesc: xxlJobText(fields.jobDesc, '任务描述', 255), author: xxlJobText(fields.author, '负责人', 64), alarmEmail: xxlJobText(fields.alarmEmail, '报警邮箱', 255, true),
    scheduleType: scheduleType as XxlJobEditable['scheduleType'], scheduleConf,
    executorHandler: xxlJobText(fields.executorHandler, '处理方法名称', 255), executorParam: xxlJobText(fields.executorParam, '运行参数', 512, true, true),
    executorRouteStrategy: route, executorBlockStrategy: block, executorTimeout: xxlJobInteger(fields.executorTimeout, '超时秒数', 0, 2_147_483_647),
    executorFailRetryCount: xxlJobInteger(fields.executorFailRetryCount, '失败重试次数', 0, 2_147_483_647), misfireStrategy: misfire, childJobId,
  };
}
export function normalizeXxlJobCreate(value: XxlJobFieldsInput | unknown): XxlJobEditable {
  return normalize({ ...XXL_JOB_DEFAULTS, ...inputObject(value, XXL_JOB_EDITABLE_FIELDS) });
}
export function mergeXxlJob(existing: XxlJobDetail, value: XxlJobFieldsInput | unknown): XxlJobEditable {
  if (existing.glueType !== 'BEAN') throw connectionFailure('xxl_job_glue_write_unsupported', '本次只支持代码处理器模式（BEAN）配置修改，未发布在线脚本。', 422);
  const fields = Object.fromEntries(XXL_JOB_EDITABLE_FIELDS.map(key => [key, existing[key]]));
  return normalize({ ...fields, ...inputObject(value, XXL_JOB_EDITABLE_FIELDS) });
}
