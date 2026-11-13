## Context

动机见 proposal。当前事实：

- 执行方描述 `ExecutorDescriptor` 只有 `id`、`label`、`capabilities`（[contracts.ts](../../../services/buildr-agent/src/contracts.ts)）；执行方与模型来源的配对差异由调用方按标识判断。主要位置：
  - `conversation-application.ts` 的发送校验（Qoder CN 默认账号、Qoder 平台登录、Qoder 拒绝其他来源、Devin+Codex 配置哈希）、`nativeLeaseProvider()` 原生直通、`participantHomeRoot()` 只对 Codex/DSH 共享原生主目录、原生工具变更只对五个标识生效；
  - `agent-service.ts` 为 DSH、Qoder、Qoder CN 分别装配原生账号来源与连接视图覆盖；
  - `connection-application.ts` 的升级验证名单（Qoder、Qoder CN、Claude Code）与临时账号探针名单（Codex、DSH、Qoder）；
  - `executors/model-gateway.ts` 只允许 `qoder`、`qoder-cn` 作为 `nativeModel.provider`；
  - `executors/index.ts` 与 `native-content-resolver.ts` 按标识分派原生工具详情与原生内容根；
  - `program-updates.ts` 按 Qoder 标识决定版本展示方式；
  - `claude/index.ts` 的 `inspectAccount()` 返回伪造的 `ready`。
- 前端 `conversation-options.ts` 的 `qoderSourceUnsupported()`、`AgentProgramPreparation.tsx` 的准备说明三元链、`AccountModelManager.tsx` 的 OpenAI/Anthropic 文案、`ConversationProcessBlock.tsx` 的详情品牌名单、`types.ts` 的 `ProviderId` 封闭联合类型与 `model-picker.ts` 的名称表。
- 程序准备：`program-policy.ts` 每家只有 npm `package`/`entry`；`program-release.ts` 固定读取 `registry.npmjs.org/<pkg>/latest`；`program-manager.ts` 以 `npm install --prefix` 安装到按准确版本命名的受管目录，并以 `prepared.json` 指针保护最新包。
- 已核实 Antigravity 官方安装方式：清单 `.../manifests/<platform>.json` 返回 `{version,url,sha512}`；macOS/Linux 为只含单一成员 `antigravity` 的 `.tar.gz`，Windows 为直接的 `.exe`；官方脚本校验 SHA-512 后仅解出该成员，并额外运行 `agy install` 修改 shell 环境（Buildr 不应执行）。

## Goals / Non-Goals

**Goals:**

- 新增执行方或来源时只需声明，公共层与前端不再新增品牌分支；现有五个执行方与全部来源对用户行为零变化。
- 网关路径与原生直通路径各有明确的输入、身份校验与失败行为，支持不提供网关推理的来源。
- 静态兼容判定只有一个权威实现（服务端），前端读取结果；发送时可用性由服务端实时校验。
- 程序准备支持官方发布清单归档，与 npm 分发共享最新版本、受管目录、准备指针与回收语义，并具备完整失败边界。

**Non-Goals:**

- 不接入 Antigravity、不新增模型来源、不改变任何执行方交互协议（由 `antigravity-cli-integration` 承接）。
- 不修复 Claude Code 既有交互缺陷；仅移除其伪造账号观察。
- 不引入凭据作用域、系统密钥环相关能力（无现有使用者，随 Antigravity 变更引入）。
- 不调整存储结构、绑定指纹、原生会话编号与既有受管程序目录。

## Decisions

### D1 执行方描述增加 `modelPolicy` 与 `runtimeTraits`

在 `ExecutorDescriptor` 增加只读声明（命名在实施时可微调，语义固定）：

```ts
modelPolicy: {
  account: 'native' | 'source-required';          // claude-code: source-required
  gateway?: { protocol: 'responses' | 'chat-completions' | 'anthropic-messages' };
  native?: {
    sourceProviders: readonly string[];            // qoder: ['qoder','native-qoder']
    exclusive?: boolean;                           // qoder/qoder-cn: 只接受自身原生来源
    binding: 'gateway-lease' | 'account-identity'; // qoder/qoder-cn: gateway-lease（保持现状）
    defaultSourceAccountId?: string;               // qoder-cn: 独立模型账号即执行登录
    readySourceSupersedesConnection?: boolean;     // qoder-cn: 所选原生账号就绪时不以旧连接观察先行拒绝
    platformLogin?: 'required-for-sources';        // qoder: 选其他来源也需平台登录
  };
}
runtimeTraits: {
  sharedNativeHome?: boolean;                      // codex/dsh
  upgradeVerification?: 'runtime' | 'account-probe';
  transientAccountProbe?: boolean;                 // codex/dsh/qoder(observeAccount)
  configurationIncludesPermission?: readonly string[]; // codex: ['devin']
}
```

`ConnectionView` 投射 `modelPolicy` 的公开子集。各调用点改为读取声明：发送校验、`nativeLeaseProvider()`、`participantHomeRoot()`、升级验证与探针、`checkedGateway()`（以执行方声明的原生来源校验 `nativeModel`，`nativeModel.provider` 类型放宽为执行方标识）。Claude Code 声明 `account: 'source-required'`，连接视图不再依赖伪造 `inspectAccount()`。

- 备选：继续保留品牌判断、抽出集中常量表。否决：仍是公共层知道品牌，Antigravity 需同时改常量表与调用点。
- 备选：让执行方实现回调函数自行判定。否决：判定需在前端与服务端一致，声明式数据可投射并测试，回调不可投射。

### D2 模型来源声明 `sharing` 与 `presentation`，服务端投射兼容结果

`ModelProvider` 增加：

```ts
sharing?: { kind: 'gateway' } | { kind: 'executor-exclusive'; executors: readonly string[]; reason: string };
inference?: 'gateway' | 'none';   // none：来源不提供 Buildr 网关推理（如只能由原生执行方消费的订阅）
presentation?: { vendorLabel: string; apiKeyHint?: string; billing?: { url: string; label: string } };
```

缺省为 `sharing: gateway`、`inference: gateway`，与现有来源行为一致。服务端以唯一纯函数 `sourceCompatibility(executor.modelPolicy, source)` 判定**静态兼容**，并在账号视图投射 `executorCompatibility: Array<{connectionId; compatible; reasonCode?; reason?}>`。

**静态兼容与发送时可用性是两件事**：

- `executorCompatibility` 只回答“按双方声明，这个执行方能否使用这个来源”，与账号是否登录、过期，模型是否停用，身份是否变化无关。字段缺失（旧后台或新来源尚未投射）时前端按原有行为处理（视为兼容、不提示），最终仍以发送校验为准。
- 前端只用该字段决定“不可选 + 原因”；登录、过期、停用等状态继续由已有账号与模型状态字段表达。前后端一致性的承诺只针对静态兼容结论与原因码。
- 发送时可用性由服务端在副作用前实时校验，见 D2b。

- 备选：前端复刻判定函数。否决：两处实现必然漂移。
- 备选：按模型逐项投射。否决：静态兼容在来源粒度成立；模型级可用性已由模型启用与可用字段表达。

### D2a 两条模型路径的绑定契约

执行方与所选来源的组合按声明归入且只归入一条路径，在打开运行时前确定，后续准备、发送、恢复、释放沿用同一路径：

| | 网关路径 | 原生直通：`gateway-lease` | 原生直通：`account-identity` |
|---|---|---|---|
| 适用 | 来源 `inference: gateway`，执行方声明 `gateway` | 来源属执行方 `native.sourceProviders` 且 `binding: gateway-lease`（Qoder、Qoder CN，保持现状） | 来源属执行方 `native.sourceProviders` 且 `binding: account-identity`（第二步的 Antigravity） |
| 输入 | 租约（身份、本机地址、临时密钥、单一模型能力） | 租约 + `nativeModel{executor, modelId, accountIdentity}` | `nativeSource{accountId, accountIdentity, modelId, model 能力}`，不签发租约 |
| 身份校验 | 签发租约时校验来源身份与模型；执行方核对租约 | 同左，另由执行方以原生登录核对账号 | 打开前校验来源就绪、身份与参与者绑定一致、模型在来源目录且启用；执行方在输入前以原生观察核对当前账号身份与模型，不一致即拒绝 |
| 运行时键 | 连接 + 租约身份 | 连接 + 租约身份 | 由执行方按自身隔离策略决定（第二步按对话），公共层以 连接 + 来源账号身份 作为复用前提 |
| 失败 | 签发失败 → `agent_model_source_unavailable` 等既有错误，零工作输入 | 同左 | 来源未就绪/身份不符/模型不可用 → 对应既有错误码，零工作输入；执行方核对失败抛 `ExecutorInputRejected` |
| 释放 | 执行结束撤销租约 | 同左 | 无租约；按执行方资源释放证明回收 |

`ExecutorOpenOptions` 增加与 `gateway` 互斥的 `nativeSource`；`checkedGateway()` 校验 `nativeModel.executor` 必须是该执行方且其声明为 `gateway-lease`。`inference: none` 的来源：租约签发直接拒绝（`model_source_inference_unavailable`），单次生成（`models.generate`，用于标题等）与网关入口不得选择它，统一模型选择中对网关执行方显示为不兼容。现有 Qoder、Qoder CN 直通行为以表征测试锁定，路径表只把隐式规则显式化。

### D2b 发送时校验顺序

发送校验保持现有顺序，只把品牌判断替换为声明判断；顺序本身纳入表征测试：

1. 程序可用、对话可接收、续接条件；
2. 解析连接；`native.defaultSourceAccountId` 补默认来源（Qoder CN）；读取所选来源（读取失败延后到第 6 步抛出）；
3. `readySourceSupersedesConnection`：所选原生来源已就绪时，跳过第 4 步中旧连接观察的过期与未登录拒绝（Qoder CN 现有例外）；
4. 连接过期、未启用、`platformLogin` 要求的平台登录；
5. 权限模式在执行方声明内；
6. 来源存在、启用、就绪；身份与选择时一致；
7. 静态兼容（`sourceCompatibility`），不兼容返回来源声明的原因；
8. 模型在可用目录、已启用，服务档位与思考深度合法；
9. 路径确定（D2a）并进入准备或执行。

前端在第 7 步之前的状态由已有字段提示，服务端拒绝时以服务端原因为准。

### D3 原生详情与内容根由执行方注册

`AgentExecutor` 已有可选 `nativeContent(ctx)` 冷读入口，但公共层仍在多处自行拼接：`executors/index.ts` 的 `readNativeTool()` 分派、`native-content-resolver.ts` 与 `native-content-maintenance.ts` 的会话目录后缀和文件筛选、`storage/native-content.ts` 的安全路径正则、`conversation-application.ts` 中“哪些执行方登记 `nativeTools`”的名单。改为执行方在注册时一并声明：

```ts
nativeContent?: {
  sessionRoots: readonly { relative: string; file: RegExp }[];  // 相对原生配置根
  allowedPath: RegExp;                                           // 安全读取白名单
  readTool(root, reference): NativeToolDetail | undefined;
}
```

公共层只按 `reference.provider` 查找注册项；未注册即“不提供详情”，`nativeTools` 是否登记也由是否注册决定。会话条目公开 `nativeDetail: boolean`，前端据此按需读取，移除品牌名单。现有五家的路径规则原样迁入各自执行方模块，回归测试覆盖越界、错误会话、错误工具身份与旧引用兼容。`domain/question-answer.ts` 中为旧 DSH/Qoder 记录补 `allowOther` 的名单属于历史数据兼容，保留不动；新执行方必须在请求中显式给出 `allowOther`。

### D3a 传输中断以类型化错误表达

`conversation-application.ts` 以六个错误码白名单判断“原生观察通道中断”并进入传输中断恢复，Qoder CN 的断连因此只落到 `unknown`。在契约中新增 `ExecutorObservationLost`（携带 `scope: 'execution' | 'event'`），执行方抛出该类型即进入同一恢复路径；既有六个错误码继续识别以保持兼容。Qoder CN 是否切换到新类型属于其行为修正，不在本变更内改变。

### D4 程序策略声明分发方式

```ts
distribution:
  | { kind: 'npm'; package: string; entry: string }
  | { kind: 'manifest'; manifest: (platform) => URL; allowedHosts: readonly string[];
      digest: 'sha512'; payload: { 'tar.gz'?: { member: string }; binary?: true }; entry: string }
versionDisplay: 'program' | 'package';
```

- `readProgramLatestRelease()` 按 `kind` 读取 npm `latest` 或清单 `version`；两者读取失败均明确停止、不降级。
- `program-updates.ts` 依据 `versionDisplay`，移除 Qoder 判断。

清单准备的失败边界：

| 环节 | 约束 | 失败行为 |
|---|---|---|
| 请求与重定向 | 清单与归档请求均使用手动重定向，最多 5 跳；每一跳（含首跳）必须是 HTTPS、无用户信息、主机在 `allowedHosts` 内；清单与归档各自有独立主机白名单 | 任一跳不合规即中止，不跟随 |
| 清单内容 | 响应不超过 64 KiB，必须是含 `version`、`url`、`sha512` 的 JSON 对象；`sha512` 为 128 位十六进制 | 解析失败、字段缺失或格式不符即失败 |
| 版本进入目录名 | `version` 必须匹配严格语义化版本（仅数字、点与预发布标识 `[0-9A-Za-z.-]`，总长不超过 64），并满足策略主版本准入；目录名由校验后的版本与提供者标识拼接，不含路径分隔符 | 不符即失败，不做转义或截断 |
| 下载 | 流式写入受管临时目录，同时计算 SHA-512；归档上限 512 MiB，超限立即中止；完成后摘要比对 | 超限、中断或摘要不符即删除临时文件并失败 |
| 解压 | 进程内 `zlib` + 有界 tar 头解析：只接受 ustar/GNU 普通文件头，成员数上限 16，只提取策略声明的唯一成员，解出大小上限 1 GiB；拒绝链接、设备文件、绝对路径、`..`、重复或缺失声明成员；Windows `binary` 直接落盘同样受 1 GiB 限制 | 任一违规即删除临时目录并失败 |
| 验证 | 设置可执行权限；macOS 尝试移除下载隔离属性（失败只记诊断）；执行 `--version`，输出必须等于清单版本 | 不等即失败 |
| 切换 | 临时目录校验完成后原子重命名为准确版本受管目录（目标已存在且身份一致则复用，不一致则失败保留原目录）；之后以“写临时文件 + 原子重命名”更新 `prepared.json`；绑定只在连接准备成功后改变 | 任何前序失败都不触碰 `prepared.json`、旧受管目录与已有绑定 |
| 并发与中断 | 同一提供者的准备持有进程内互斥并以准备尝试身份去重，第二个请求加入同一尝试或得到明确的进行中结果；临时目录按尝试身份命名，后台启动与下次准备时清理无主临时目录 | 中断后旧程序、`prepared.json` 与绑定保持可用 |

- 不执行官方安装脚本中的 `agy install` 等环境改写动作。
- 备选：调用系统 `tar`。否决：各平台 tar 行为差异与链接处理难以统一证明，进程内解析可严格限定单成员。
- 备选：允许绑定用户已装 `agy`。否决：用户已确认沿用“新接入仅使用 Buildr 独立程序”。

### D5 前端去品牌化

`types.ts` 的 `ProviderId` 改为 `string`，名称取自服务端 `label`；`AgentProgramPreparation` 的说明取 `catalog.installation.guidance`（由程序策略提供）；`AccountModelManager` 的厂商名、API Key 提示、账单入口取来源 `presentation`；`ConversationProcessBlock` 依据 `nativeDetail`；`model-picker.ts` 名称表退化为服务端标签缺失时的兜底。原型目录 `src/prototypes/**` 不在本次范围。

### D6 先锁定现状再重构

实施第一步为现有组合补充表征测试（Characterization Test）：五个执行方 × 代表性来源（原生、Codex 订阅、Qoder、Qoder CN、Devin、API Key、自定义）的发送校验结果、原因码与拒绝顺序（含 Qoder CN“所选原生账号就绪时旧连接观察不先行拒绝”）、准备与发送两条路径的租约签发与原生直通判定、单次生成的来源选择、共享主目录、升级验证路径、详情读取；以及现有 npm 准备流程。重构后同一测试必须原样通过。`account-identity` 路径在本步没有现有执行方使用，以替身执行方测试其契约。

## Risks / Trade-offs

- [重构遗漏隐性分支导致行为漂移] → D6 表征测试先行；以 `rg` 校验公共层与前端功能目录不再出现执行方品牌字面量（执行方自身模块与原型除外），作为静态检查纳入。
- [与进行中的 `bounded-native-history-and-latest-agent-programs`、`agent-process-isolation` 改动相邻] → 实施前基于 `dev` 最新代码重新比对，二者先合入则在其结果上重构；不复制或回退其行为。
- [公开视图新增字段影响宿主契约] → 只新增可选只读字段；旧前端忽略未知字段，旧数据缺省按原行为推导。
- [清单来源被劫持或返回异常] → 主机白名单 + HTTPS + SHA-512；清单与归档任一异常均失败并保留旧程序。
- [进程内 tar 解析实现缺陷] → 只支持 ustar/GNU 普通文件头与长度上限，配套恶意归档测试（链接、越界、超长、截断）。
- [`account-identity` 路径本步无真实使用者，可能与第二步实测不符] → 本步以替身执行方锁定公共契约；第二步实测若需调整，只改执行方侧实现，公共输入与失败语义变化须回到本规范修订。

## Migration Plan

纯代码重构与可选字段新增，无数据迁移。发布后旧会话、绑定与受管程序原样可用；回滚为直接回退代码，不留下需要清理的持久状态。

## Open Questions

- 无影响规范或任务拆分的未决问题。Windows 清单为直接 `.exe` 已核实；其他平台若未来改为 `zip`，按同一 `payload` 扩展。
