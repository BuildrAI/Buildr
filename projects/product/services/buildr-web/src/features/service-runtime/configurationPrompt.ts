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

服务页只启动当前服务，选择工作树（Worktree）、分支（Branch）与远程连接环境。使用 local.remoteEnvironments 声明已经验证的环境 code、name、可选网关根 url 及 variables；环境变量只来自保存的定义，不允许启动请求注入任意变量或地址。前端普通请求保留完整路径统一经过所选网关，不要求维护全部下游清单；新增请求只要网关已有对应路由即可访问。

开发任务一键启动前后端时，仅按本次任务需要调查本地覆盖。直接地址（Direct URL）条目用 local.backends 表达已验证的 serviceCode、environmentVariable 和 remoteUrl；版本 2 显式 kind: direct-url。本任务实际启动后端才注入其 127.0.0.1 实际端口，按该服务监听入口转换路径；其他请求保留网关路由前缀。未知映射继续远程，不猜服务。一个探针不能代表全部业务验收。

任务联调需要服务发现（Service Discovery）时，条目使用 version: 2、kind: service-discovery、serviceCode、真实 serviceId 和固定 fallback: {kind: existing-discovery, context: qa}，不得编造远程 URL。同时沿代码核实 local.routing 的自身 serviceId、environmentVariable、format: buildr.local-service-routing/v1 和只读 observationPath；变量只传入身份上下文文件路径，不传认证、密钥或任意地址。没有下游切换需求的服务不添加 backends。

沿真实依赖、请求客户端、启动脚本与自动装配（Auto-configuration）验证覆盖点，不凭 Spring Cloud 或 Nacos 名称推断。服务列表普通主工作库启动沿应用现有 QA 配置运行，不创建任务泳道（Lane）或注入任务路由文件，不要求手选下游；已有包装器须核对无路由文件时也能普通启动，并保持本次进程与适用临时副作用的准确身份隔离。主工作库不接受本地发现目标；任务入口保留原版本 1 泳道（Lane）：同任务本机目标优先，未选择本地目标时回落既有 QA，已选运行消失、歧义或发现失败必须显式失败，不静默采用后来实例。任务切换携带已观察运行编号及 expectedRoutingDigest，接收方须拒绝旧运行编号。

单服务使用 start --standalone 与已声明 environment；不因来源工作树（Worktree）关联任务而加入任务。本地联调在任务入口自动按本任务实例连接。不同分支（Branch）没有对应工作树（Worktree）时，prepare-source 创建独立检出，不切换或覆盖原目录。启动参数可用 {workspaceRoot} 定位工作空间脚本，进程获得 BUILDR_WORKSPACE_ROOT、BUILDR_SERVICE_ROOT 和 BUILDR_SERVICE_CODE，包装器必须使用真实所选代码及其依赖或编译产物，不得启动原目录的旧产物冒充目标版本。确认目标确实注入进程并核对只读请求结果。注册受理、当前可发现、实际请求及完整业务验收分别说明，不伪造 verifiedAt。缺少信息时只询问无法从现场查明的地址或决定。

候选命令与正式已验证定义要区分。先在授权范围实际验证候选，核对真实端口、就绪、日志与请求结果，再保存已证明的配置；不能把未验证项目或仅建议的命令记为已验证，也不为未验证内容更新 verifiedAt。已有定义按差异修改，保留未知字段与旧 environments；已有实例保留启动时快照，不静默停止或重启其他运行。

当前没有配置 validate/save 命令。验证后编辑上面工作空间内的 services/${serviceCode}/runtime.yml，再用 show 读回结构、字段和诊断，并报告实际验证结果与尚存缺口。现有同范围的配置、启动和验证授权继续有效，不重复询问；缺少启动授权时先完成调查，再仅确认相关启动影响。远程业务写入、部署、共享配置修改和凭证读取不因本请求自动获得授权。

最后简要告诉我：配置了什么、实际验证了什么、还有什么未完成，以及之后如何从界面使用。`;
}
