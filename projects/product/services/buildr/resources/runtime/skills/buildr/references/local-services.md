# 服务本地运行

智能体（Agent）、开发和测试使用同一组本地运行事实。服务入口只启动当前服务，选择工作树（Worktree）、分支（Branch）与远程连接环境，不展示逐下游本地选择。任务入口一键启动本任务前后端，实际本地服务自动连接本任务端口，其他请求保持远程；发现调用继续使用原任务泳道（Lane）。主工作库由真实身份判定，不从分支（Branch）名称猜测。

普通启动使用 `start --standalone [--environment <code>]`；`local.remoteEnvironments` 保存已验证环境的编号、名称、可选网关根地址及变量。无声明时沿应用现有配置运行，不猜新环境。前端新增请求保留路径经网关访问，不要求完整下游清单；仅任务所需本地映射使用 `local.backends`。以下旧直接地址及发现参数继续为任务联调和兼容调用提供能力，不作为普通服务界面的操作步骤。

选定分支（Branch）后，用 `code branches` 读取已登记代码库的真实引用与观察版本，再调用 `service-runtime prepare-source --service <code> --worktree <观察来源id> --branch <完整ref> --expected-target-hash <hash> --expected-revision <revision>`。已有对应工作树（Worktree）时复用；否则自动创建独立目录，不切换、重置或清空原目录，不隐式获取远程。使用返回的实际目录及代码观察启动。服务界面复用源代码管理的分支管理组件（Component）；显式检出切换使用同一代码能力及版本检查，独立目录使用则沿上述准备路径。启动时只接受实际工作树（Worktree）的当前分支（Branch），不保留尚未检出的待启动选择。新增检出的依赖和产物也须匹配所选源码；命令可用 `{workspaceRoot}` 定位工作空间脚本，进程得到 `BUILDR_WORKSPACE_ROOT`、`BUILDR_SERVICE_ROOT` 和 `BUILDR_SERVICE_CODE`。没有准备好的依赖时准确说明，不冒用其他分支（Branch）的旧产物。

## 先确认目标与当前事实

确认已有授权包含启动服务和本次真实验证；同一范围的授权继续有效，不重复询问。扩大到远程业务写入时仍核对该动作授权。查看配置、目录、实例与日志本身不启动服务。

先运行 `buildr service-runtime --help`。以下命令的 `--target <workspace>` 都指向规范工作空间（Workspace），不是服务代码目录；从返回结果选准确服务编码、工作树（Worktree）编号及运行编号，不手拼身份或任意传入目录。

| 需要 | 命令 |
| --- | --- |
| 查看服务定义、运行状态和缺口 | `buildr service-runtime overview --target <workspace> --json`；单服务用 `show --service <code>` |
| 选择单服务实际代码目录 | `buildr service-runtime worktrees --service <code> --target <workspace> --json` |
| 查看任务服务、对应目录和现有实例 | `buildr service-runtime task-show --task <task-id> --target <workspace> --json` |

对照返回的路径、任务归属、当前分支（Branch）、提交（Commit）和未提交改动选择目录。任务缺少对应目录时只处理该服务缺口，不回落主工作库或其他任务。来源发生变化后重新读取判断，不沿用旧观察。

真实主工作库的 `main: true`、`taskId: null` 表示普通启动。即使定义存在 `local.routing`，普通启动也不生成任务路由文件或泳道（Lane）元数据，并清空该声明变量，避免继承父进程遗留的任务文件。发现下游的默认、`auto` 或 `remote` 只记录沿应用既有 QA 配置运行的选择意图，实际调用仍需验证；不支持 `local` 或显式发现运行目标，任务联调使用对应任务目录。应用或包装器须支持无路由文件启动；定义声明和一个任务探针不能证明该路径已验证。未知或矛盾的目录身份只阻止对应启动，不伪造任务。

## 选择服务与前端连接

可只启动后端、只启动前端，或显式选择相关前后端。前端已验证定义中的 `local.backends` 逐项声明后端服务编码、目标注入变量及远程测试地址，可声明多个后端（旧 `local.backend` 单对象声明仍可读取）；服务端逐个后端解析实际地址并注入对应声明变量，不接受任意远程地址或环境变量。

- `--connection local|remote` 对未显式指定的后端整体生效：`local` 为同范围唯一已就绪实例，`remote` 为远程测试地址。
- `local`：任务前端连接同一任务已就绪后端；主工作库前端连接主工作库后端。使用返回实例的实际地址，不猜首选端口。独立前端的本地选项仅在目标唯一且就绪时可选，并显示来源和实际地址；缺失或歧义先处理对应后端，不隐式启动未选服务。任务明确同时选择后端时，仍可一次提交，由系统等待后端就绪后连接。
- `remote`：只启动所选前端也可验证，连接定义中已验证的固定远程测试地址，不启动本地业务后端。先核对前端已有环境配置、代理路径与最终目标；日常启动只选择模式，不重复填写域名。
- 逐后端指定：`show` 返回的 `connectionTargets` 按声明后端分组，列出每个后端当前全部已就绪实例（来源、分支、实际地址、是否同范围）及默认目标。需要连某个具体实例（含跨任务/跨范围）时，用 `--backend-target <serviceCode>:<runId>` 显式指定，可重复传入多个后端；服务端重新校验该实例存在、已就绪且属于声明后端，不接受任意地址。这些明确目标用于任务联调的切换与兼容接口；普通服务界面只选择远程环境。

单项启动使用已读取的工作树（Worktree）编号：

```text
buildr service-runtime start --service <code> --worktree <worktree-id> --connection local --origin agent --target <workspace> --json
```

`show` 返回每个代码来源的 `connectionTargets`（逐声明后端分组）；已观察本地目标时，启动或重启可携带 `--expected-backend-run <backend-run-id>`，目标被替换则重新核对，不静默连接后来出现的实例。前后端一起启动时实际目标尚未产生，由组合能力等待并确定；`task-start` 同样接受 `--backend-target <serviceCode>:<runId>`，为未同时选择启动的声明后端显式指定实例。

任务启动的 `--services` 是明确选择的逗号分隔服务编码；只选一个编码即可独立启动。以下命令等待所选后端就绪，再以其实际端口启动本地连接前端：

```text
buildr service-runtime task-start --task <task-id> --services <backend-code>,<frontend-code> --connection local --origin agent --target <workspace> --json
```

只启动任务前端并连接远程时，使用 `--services <frontend-code> --connection remote`。命令行接口（CLI）默认启动来源为智能体（Agent）；使用 `--origin agent` 明确本次入口。任务组合逐项返回启动、复用或错误，已有成功项保留；局部失败先读该项日志，不重启无关成功实例或把整组表述为成功。

## 任务内服务发现（Service Discovery）

版本 2 复用 `local.backends`，发现条目声明真实应用名称及固定 QA 回落；混合列表的直接地址条目须显式使用 `kind: direct-url`。旧 `local.backend` 和版本 1 列表继续可读。以下是协议结构示例，应用名称与入口必须沿真实代码验证，不能照抄后填验证时间：

```yaml
version: 2
# source、verifiedAt 和启动字段须来自真实验证
local:
  routing:
    serviceId: business-app
    environmentVariable: LOCAL_SERVICE_ROUTING_FILE
    format: buildr.local-service-routing/v1
    observationPath: /actuator/local-service-routing
  backends:
    - kind: service-discovery
      serviceCode: upms
      serviceId: upms-app
      fallback: {kind: existing-discovery, context: qa}
```

`local.routing.serviceId` 是调用方真实发现名称，不能从服务编码猜测。声明变量仅接收 Buildr 生成的本机上下文文件路径；文件包含任务、工作空间、本机、泳道（Lane）和运行身份及已声明目标，不包含认证、密钥或任意 URL。Buildr 不内置 Spring Cloud 或 Nacos 客户端。智能体（Agent）须沿实际依赖版本、自动装配（Auto-configuration）、负载均衡（Load Balancing）、请求及启动链核实应用组件如何消费文件、隔离注册、选择目标、拒绝旧接收方身份和提供只读观察。无接入组件时在已有修改授权内完成接入并验证，或明确报告具体缺口，不为过校验伪造 `verifiedAt`。

任务泳道（Lane）的发现模式只支持明确任务目录及同任务本机候选，不能借用主库或其他任务；主工作库普通启动沿应用原配置运行，不进入该模式。`task-start` 省略 `--connection` 时，已选参与者使用预分配的运行编号，允许发现关系成环；只有直接地址的前置边等待就绪。未选本地下游时按声明回落 QA；严格 `--connection local` 缺少目标报错，`remote` 明确使用 QA。已选目标未就绪、消失、发现异常或歧义不能偷偷回落 QA，也不能采用后来出现的同名或同端口实例。局部失败保留其他成功项；进入 QA 后的调用留在 QA。

显式连接使用 `--backend-target <serviceCode>:<runId>` 固定已观察目标。切换发现调用方还须携带其当前 `routing.contextDigest`：

```text
buildr service-runtime restart --run <caller-run-id> --backend-target <service-code>:<observed-run-id> --expected-routing-digest <digest> --target <workspace> --json
```

界面自动选择也提交观察到的目标编号或明确的缺失事实。当前版本在重启时应用新上下文，不热更新。注册受理、当前可发现、实际请求到达及完整业务验收是不同事实：结合 `routing.observation`、逐下游调用及日志分别说明；观察缺失或不可用不能表述为成功。旧运行没有这些事实时保持未知。接收方必须拒绝不匹配的运行编号，防止同端口替换接收旧请求。

## 就绪后完成真实验证

启动命令等待就绪或失败后返回；进程独立运行，命令退出不等于服务停止。核对返回的运行编号、启动时代码快照、实际端口、地址和连接目标。首选端口被占用时使用实际返回端口，不沿用默认值。连接快照表示启动目标，进程就绪表示启动检查通过，两者均不证明业务请求已联通。

使用实例真实地址在新的浏览器页签（Tab）打开，或用接口工具执行本次授权场景；按 `project-verification` 保存实际结果。分别说明“服务已就绪”“业务验证已执行及结果”和“未覆盖项”，不把模拟、日志匹配或首页能打开当作完整业务验证。

```text
buildr service-runtime log --run <run-id> --max-bytes 65536 --target <workspace> --json
buildr service-runtime restart --run <run-id> --connection local --target <workspace> --json
buildr service-runtime stop --run <run-id> --target <workspace> --json
```

停止只针对已核对归属的准确运行编号；停止任务服务时逐项处理该任务实例，不停止主工作库、其他任务或未托管进程。切换使用 `restart`，先由服务器重新核对代码来源和连接目标，失败时不停止原前端；校验通过后停止旧实例并以同一目录重新启动，事先说明该影响。不要拆成先 `stop` 再 `start` 绕过切换前检查。停止后真正的启动失败保留停止事实和错误，不宣称旧实例仍运行或切换完成。身份不明的旧进程按诊断调查，不直接按历史进程号终止。

## 首次配置与检查已有配置

从当前工作空间（Workspace）的服务编码开始，使用上面的 `show` 和 `worktrees` 读取现有定义、真实代码目录及诊断。服务名、目录名和分支（Branch）名不证明它是前端或后端，以服务登记中的 `type`（`frontend`/`backend`，界面显示「前端」「后端」）为准。先验证统一远程网关及请求路径，普通启动不要求完整下游清单；开发任务需要本地覆盖时再核对本次参与服务、实际客户端及代理（Proxy）路径，不能将单个探针当作完整业务验收。没有下游切换需求的服务只配置启动方式；后端之间的发现调用也可声明，不能根据前后端名称排除。用户无需了解内部命令或手填字段，由智能体（Agent）完成调查、验证和保存；只有现场无法查明的目标地址、业务决定或缺少的授权才请用户补充。

读取服务规则、实际代码、项目脚本、启动文档、构建与运行配置，核实依赖及副作用。已有启动和本次验证授权继续有效，不逐步骤重复确认；未授权启动时先完成只读调查并说明需要启动的具体对象和影响。不得将本地运行授权扩展成远程业务写入、部署、共享配置修改或读取凭证。

### 先验证候选

候选命令与正式已验证定义必须区分。先按项目适用的方式验证候选，不能为了通过运行定义的读取校验，先把尚未执行的候选写成 `source: agent` 或伪造 `verifiedAt`。验证时记录自己启动的准确进程、目录与端口，仅清理本次明确拥有的临时进程；已有实例不静默停止或重启。

核对下列事实：

| 字段 | 实际含义与验证要求 |
| --- | --- |
| `command` | 启动命令的参数数组，不是拼接后的终端字符串。包装脚本须正确转发参数；不得把当前用户的机器路径当作所有检出目录都适用的入口。 |
| `cwd` | 相对 `worktrees` 返回的服务代码目录，不是相对工作空间根或任意代码库根；必须存在，真实路径不得越出所选服务目录。 |
| `profile` | 已使用配置档案（Profile）的说明，不会自动传成命令参数或环境变量；实际选择必须由已验证命令完成。 |
| `preferredPort` | 真实监听端口，不能仅依据旧文档或日志中的默认值。 |
| `portOverride` | 当前实现追加一个 `flag=port` 参数，例如 `--port=3001`。先证明命令或包装脚本接收并生效；不支持时省略，端口冲突将明确失败。 |
| `readiness` | `http` 使用实际可成功返回的只读路径，`log` 使用实际出现的模式。登录页、健康路径或日志是否适用按项目判断；就绪不代表完整业务验证。 |
| `timeoutSeconds` | 按真实启动耗时选择，范围 10–3600 秒。 |

以下仅说明普通服务的字段结构，命令、路径、端口及就绪路径均须替换为从该服务代码验证的值：

```yaml
version: 1
source: agent
verifiedAt: "2026-10-22T08:00:00Z" # 使用本次实际验证时间，不照抄示例
local:
  command: ["node", "scripts/dev-server.mjs"]
  cwd: "."
  preferredPort: 3000
  portOverride: "--port"
  readiness:
    kind: http
    path: "/health"
  timeoutSeconds: 120
```

### 需要前端连接选择时

只有真实代码支持目标注入，才补充以下可选片段。沿请求客户端、代理、启动脚本和环境配置定位实际读取位置，核对注入变量和远程测试地址来源；不凭技术栈猜变量名，不读取认证秘密，也不擅改业务代码来凑配置。

```yaml
local:
  # 保留已验证的 command、cwd、端口、就绪与超时字段
  backends:
    - serviceCode: "business-api"
      environmentVariable: "BACKEND_URL"
      remoteUrl: "https://test.example.com"
    - serviceCode: "upms"
      environmentVariable: "UPMS_URL"
      remoteUrl: "https://test.example.com/upms"
```

`serviceCode` 必须对应已登记的真实后端，同一列表内不得重复；`environmentVariable` 必须由启动后的进程或开发代理实际读取，各后端注入变量互不相同，构建时固化的变量不能假定在启动时生效。`remoteUrl` 是已核实的远程测试后端地址，不得含认证和片段。`backend` 与 `backends` 不能并存；旧 `backend` 单对象声明读取时归一为一项 `backends`。

远程经统一网关访问时，`remoteUrl` 使用已核实的实际连接根，通常是网关源地址（Origin）；服务路由路径由应用适配保留，不能把某个服务的网关前缀当成多个后端共用的基址，也不能重复拼接该前缀。本地直接连接才按所选实例的实际端口和监听路径执行必要的路径重写（Rewrite）。逐项验证远程路径保留与本地转换；没有已核实本地映射的前缀保留既有网关回落，独立通道和模拟接口不算作已发现的 QA 业务后端。产品通用资源不保存私有业务映射或地址。

按已有授权分别验证本地与远程模式。确认环境变量被正确注入，并用项目适用的只读路径验证请求实际到达所选目标；可根据真实响应、代理行为或目标日志核对，不能仅看到变量存在、页面可打开或前端已就绪就宣称连接成功。验证本地模式时使用匹配任务或主工作库的后端实际地址与端口；远程模式不得暗中启动本地后端，也不得默认获准远程业务写入。仅验证一个模式时如实保留另一模式的缺口，不把新的双模式声明写成全部已验证。

### 保存并读回

实际验证通过后，用普通文件编辑将已证明字段保存到规范工作空间（Workspace）的 `services/<service-code>/runtime.yml`；定义使用与字段匹配的 `version: 1` 或 `version: 2`、`source: agent` 和真实 `verifiedAt`。当前命令行接口（CLI）没有配置 `validate` 或 `save` 命令，不编造这些入口。

重配已有定义时，写入前重读并对照当前内容，按差异保留未知字段、旧 `environments` 及无关配置；发生他人修改时重新核对，不静默覆盖。只为本次确实重新验证的内容更新验证时间，不将旧证据冒充新验证。已有实例继续展示各自启动时的快照，修改定义不会自动重启它们；确需切换或重启时核对具体实例和已有授权。

保存后读回实际结构与诊断：

```text
buildr service-runtime show --service <service-code> --target <workspace> --json
```

`show` 会解析定义并返回可观察结果，结构可读不等于命令已执行或业务验证通过。结合真实启动、实际端口、日志及适用的只读请求报告“已验证什么、尚缺什么”；失败时保留准确事实，不为错误配置刷新验证时间。依赖、真实登录或业务写入超出已有授权时，只暂停相关动作并说明影响。

本模块暂不提供 QA 部署、部署计划或最近部署结果。旧 `environments` 字段兼容忽略，不删除用户配置、日志、部署历史或外部连接；独立外部系统操作继续按其技能（Skill）和通用连接程序执行。
