type ConfigurationContext = {
  workspace: { name: string; rootPath: string } | null;
  serviceCode: string | null;
  serviceName?: string;
};

/** 内部执行与复制共用同一请求；调查、验证和恢复方法由技能维护。 */
export function runtimeConfigurationPrompt({ workspace, serviceCode, serviceName }: ConfigurationContext): string {
  const root = workspace?.rootPath.trim();
  if (!root || !serviceCode) return '';
  return `请为以下服务配置或检查本地运行，让我之后能在 Buildr 查看配置并选择代码目录启动。

工作空间：${JSON.stringify(workspace?.name || root)}
规范工作空间根目录：${JSON.stringify(root)}
服务编码：${JSON.stringify(serviceCode)}
服务名称：${JSON.stringify(serviceName || serviceCode)}

读取并遵循 Buildr Skill 的“服务本地运行”指引（references/local-services.md）。核对服务登记、真实代码和已有定义，验证候选后按差异更新 services/${serviceCode}/runtime.yml 并读回。保留已有运行和无关配置，不伪造验证结果。

本次授权配置所需的本地候选启动、只读验证和上述运行定义修改；不包括远程业务写入、部署、共享配置修改或凭证读取。最后简要说明配置、实际验证和剩余缺口。`;
}
