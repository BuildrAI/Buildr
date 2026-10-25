function normalizedScope(project: any, services: any = []): any  {
  if (typeof project !== 'string' || !project.trim()) throw new Error('Declaration Intake project is required.');
  const projectCode = project.trim();
  const serviceCodes = [...new Set(services.map((service: any) => String(service).trim()).filter(Boolean))].sort();
  return {
    project: projectCode,
    services: serviceCodes,
    selectors: [`project:${projectCode}`, ...serviceCodes.map((service: any) => `service:${projectCode}/${service}`)],
  };
}

export function declarationIntakeNextAction({ trigger, project, services = [] }: any): any  {
  if (typeof trigger !== 'string' || !trigger.trim()) throw new Error('Declaration Intake trigger is required.');
  const scope = normalizedScope(project, services);
  return `核对项目声明（trigger: ${trigger.trim()}；scope: ${scope.selectors.join('、')}）：测试及 verification.yml 直接由 project-testing 建设与维护；preparation.yml 按 buildr 的准备声明指引核对真实入口。已有授权内普通维护直接完成，授权缺失或业务取舍反馈用户决定；只读发现不自动写声明。`;
}

const DECISION_FIELDS = Object.freeze([
  'scopeChanged',
  'applicabilityChanged',
  'requirednessChanged',
  'capabilityChanged',
  'externalEffectsChanged',
  'safetyExceptionChanged',
  'authorityConflict',
]);

export function classifyDeclarationMaintenance(input: any = {}): any  {
  const evidenceConfirmed = input.evidenceConfirmed === true;
  const reasons = DECISION_FIELDS.filter((field: any) => input[field] === true);
  if (!evidenceConfirmed) reasons.unshift('evidence-unconfirmed');
  return {
    classification: reasons.length ? 'user-decision-required' : 'routine-maintenance',
    requiresUserDecision: reasons.length > 0,
    reasons,
  };
}

export function declarationIntakeGapNextAction({ kind, project, services = [], scopes = [] }: any): any  {
  const scope = normalizedScope(project, services);
  const gapScopes = [...new Set(scopes.map((item: any) => String(item).trim()).filter(Boolean))].sort();
  const details = gapScopes.length ? `；gap: ${gapScopes.join('、')}` : '';
  const owner = kind === 'verification' ? 'project-testing：直接维护测试及 verification.yml，project-verification 选择并实际执行检查' : kind === 'preparation' ? 'buildr：按准备声明指引核对真实入口并维护 preparation.yml' : 'project-testing 维护测试登记，buildr 维护准备声明';
  return `项目声明缺口（scope: ${scope.selectors.join('、')}；trigger: ${kind}-gap）：${owner}；已有授权内普通维护直接完成，授权缺失或业务取舍反馈用户决定，只读发现不自动写声明${details}。`;
}
