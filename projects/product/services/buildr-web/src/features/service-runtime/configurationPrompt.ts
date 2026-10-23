type ConfigurationContext = {
  workspace: { name: string; rootPath: string } | null;
  serviceCode: string | null;
  serviceName?: string;
};

/** 复制的请求携带规范工作空间身份；缺少路径时不生成可执行指令。 */
export function runtimeConfigurationPrompt({ workspace, serviceCode, serviceName }: ConfigurationContext): string {
  const root = workspace?.rootPath.trim();
  if (!root || !serviceCode) return '';
  return `请为以下服务配置或检查本地运行，让我之后能在 Buildr 查看状态并选择代码目录启动。

工作空间：${JSON.stringify(workspace?.name || root)}
规范工作空间根目录：${JSON.stringify(root)}
服务编码：${JSON.stringify(serviceCode)}
服务名称：${JSON.stringify(serviceName || serviceCode)}

先读取 Buildr Skill 的“服务本地运行”指引（references/local-services.md），再查看当前版本的 buildr service-runtime --help。所有 --target 均指向上面的规范工作空间根目录；先用 show 和 worktrees 读取该服务的当前定义、登记和真实代码来源，不凭服务名称猜测前端、后端、分支或目录。

读取实际代码、AGENTS.md、启动文档、脚本、构建与运行配置，核对启动命令参数数组、相对服务目录的工作目录、实际配置档案、端口及覆盖方式、就绪检查、超时和共享环境副作用。profile 字段本身不会传入启动参数，portOverride 当前按 flag=port 追加，均须以实际命令行为为准。

只有确实需要切换后端且代码支持目标注入时，才在 local.backends 逐项配置 serviceCode、environmentVariable 和 remoteUrl；声明多个后端时逐项沿代码核实。沿代码查明读取目标变量的位置与远程测试地址来源，不凭名字或框架猜测；普通后端或无需切换的服务不添加 backends。按已有授权分别验证本地后端与远程测试环境：确认目标确实注入进程，并按项目适用的只读请求验证实际连接，不把变量存在或进程就绪当作连接成功。缺少信息时只询问无法从现场查明的地址或决定，不擅改业务代码来凑配置。

候选命令与正式已验证定义要区分。先在授权范围实际验证候选，核对真实端口、就绪、日志与请求结果，再保存已证明的配置；不能把未验证项目或仅建议的命令记为已验证，也不为未验证内容更新 verifiedAt。已有定义按差异修改，保留未知字段与旧 environments；已有实例保留启动时快照，不静默停止或重启其他运行。

当前没有配置 validate/save 命令。验证后编辑上面工作空间内的 services/${serviceCode}/runtime.yml，再用 show 读回结构、字段和诊断，并报告实际验证结果与尚存缺口。现有同范围的配置、启动和验证授权继续有效，不重复询问；缺少启动授权时先完成调查，再仅确认相关启动影响。远程业务写入、部署、共享配置修改和凭证读取不因本请求自动获得授权。

最后简要告诉我：配置了什么、实际验证了什么、还有什么未完成，以及之后如何从界面使用。`;
}
