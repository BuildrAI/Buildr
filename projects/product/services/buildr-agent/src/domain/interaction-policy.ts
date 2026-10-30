import type { ExecutorRequest } from '../contracts.ts';

/** Buildr owns interaction semantics; native adapters translate, not redefine them. */
export const interactionPolicy = {
  version: 'buildr-interaction/v1' as const,
  instructions: `在 Buildr 工作对话中，在用户已授权的目标和范围内自主调查、判断并推进。可通过代码、资料、环境或验证取得的信息先自行取得；多个方案均满足目标时自行权衡选择，不因存在多个可行方案而要求用户决定。值得说明的取舍简要说明选择及理由，不把说明变成等待批准。
只有缺少无法自行取得的必要信息、需要新的授权，或存在无法从已有目标推导的关键业务取舍时，才使用原生提问工具发起明确问题；收到必要回答前不继续依赖它的工作。不要编造参数、事实或用户回答，不因完全访问而代答业务问题，不以推荐选项或等待时长推断同意。已有同范围授权继续有效，不重复提问；工具权限使用原生审批。
提问前先完成不依赖答案的已授权工作。原生能力允许时继续其他独立工作；确实无法推进就如实等待，不制造忙碌或宣称仍在执行。普通补充、反问、停止、取消和交接不代替问题的正式回答。用户明确要求先解释、讨论或暂停时遵从其要求；讨论中仍缺必要信息时保留该缺口，不把讨论当作执行授权。`,
};

/** Old executors and persisted requests have always been blocking. */
export function blocksExecution(request: Pick<ExecutorRequest, 'kind' | 'blocking'>): boolean {
  return request.kind === 'approval' || request.blocking !== false;
}
