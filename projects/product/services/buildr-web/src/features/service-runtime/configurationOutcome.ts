import type { RuntimeDefinitionView } from './api/service-runtime-api';

export type ConfigurationOutcome = {
  tone: 'success' | 'info' | 'warning';
  title: string;
  description: string;
};

/** 运行定义的可比较快照；验证时间变化也代表一次新的写入。 */
export function runtimeDefinitionSignature(definition: RuntimeDefinitionView | null | undefined): string | null {
  return definition ? JSON.stringify([definition.verifiedAt, definition.local]) : null;
}

/**
 * 配置完成 = 本次配置执行已经结束，且 Buildr 能读到该服务可用的运行定义。
 * 对话结束或提交成功都不足以证明配置可用；配置可用也不代表服务已启动或业务验证通过。
 */
export function configurationOutcome({
  serviceName,
  runStatus,
  definition,
  definitionDiagnostic,
  baseline,
}: {
  serviceName: string;
  runStatus: string;
  definition: RuntimeDefinitionView | null;
  definitionDiagnostic: string | null;
  baseline: string | null;
}): ConfigurationOutcome {
  const completed = runStatus === 'completed';
  const changed = Boolean(definition) && runtimeDefinitionSignature(definition) !== baseline;
  if (definition && changed && completed) return {
    tone: 'success',
    title: `「${serviceName}」运行配置已完成`,
    description: 'Buildr 已读到新的运行定义，可以启动本地运行。实际启动与业务验证结果以对话中的报告为准。',
  };
  if (definition && changed) return {
    tone: 'warning',
    title: `「${serviceName}」运行配置已保存，执行未完成`,
    description: '新的运行定义已可读取，但本次执行未正常结束。请查看对话确认验证范围和剩余事项。',
  };
  if (definition && completed) return {
    tone: 'info',
    title: `「${serviceName}」运行配置检查完成`,
    description: '运行定义未变化，仍可继续使用；实际验证结果见对话。',
  };
  if (definition) return {
    tone: 'warning',
    title: `「${serviceName}」配置检查未完成`,
    description: '本次执行未正常结束，运行定义未变化；现有配置仍可继续使用。',
  };
  return {
    tone: 'warning',
    title: `「${serviceName}」运行配置尚未完成`,
    description: `本次执行已结束，但 Buildr 仍未读到可用的运行定义${definitionDiagnostic ? `：${definitionDiagnostic}` : ''}。请查看对话中的结果和剩余事项。`,
  };
}
