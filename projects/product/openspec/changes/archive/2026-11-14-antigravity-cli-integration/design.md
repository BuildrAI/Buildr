## Context

动机见 proposal，行为要求见 `specs/antigravity-cli-execution/spec.md`。本设计依赖前置变更 `agent-executor-capability-policy` 提供的执行方声明（`modelPolicy`、`runtimeTraits`、`nativeContent`）、按账号身份原生直通（`nativeSource`，不签发租约）、来源共享范围与推理方式、清单分发。

### 已实机核验的 `agy` 事实（1.5.8，darwin_arm64，私有 `HOME`，仅握手）

- 发布清单 `.../manifests/<platform>.json` → `{version,url,sha512}`；macOS/Linux 为只含成员 `antigravity` 的 `tar.gz`，Windows 为直接 `.exe`；解出程序约 235 MB。
- `agy --help`：`--model`、`--effort low|medium|high|xhigh|max`、`--mode accept-edits|auto|plan`、`--dangerously-skip-permissions`、`--conversation <id>`、`--output-format stream-json`；子命令 `acp`、`models`、`update`、`install`。
- `agy acp` 选项：`--login`（交互登录后退出）、`--app-data-dir`、`--gemini-dir`、`--dangerously-skip-permissions`、`--disable-telemetry`、`--process-per-session`、`--sandbox`。
- `initialize` 实测返回：`loadSession`；`promptCapabilities{image:true,audio:false,embeddedContext:true}`；`sessionCapabilities{resume,close,load,list,additionalDirectories}`；`auth{logout}`；`_meta.antigravity{tier:true,systemPrompt{append:true}}`；`authMethods`：`oauth-personal`、`oauth-business`、`gemini-api-key`、`agent-platform`。
- 二进制中存在的处理器与更新类型：`session/new|load|resume|prompt|cancel|close|list|set_mode|set_model|set_config_option`、`authenticate`、`logout`、`session/request_permission`、`elicitation/create`；更新 `agent_message_chunk`、`agent_thought_chunk`、`user_message_chunk`、`tool_call`、`tool_call_update`、`plan`、`usage_update`、`session_info_update`（标题）、`current_mode_update`、`config_option_update`、`available_commands_update`；`PromptResult` 含 `usage`。
- 私有 `HOME` 下仅生成 `.gemini/antigravity-cli/{settings.json,log/}`；`settings.json` 写入 `{"autoUpdate": false}` 后被保留。二进制引用 macOS Keychain 与 `go-keyring`，会话记录位于 `.gemini/antigravity/brain` 与 `transcript.jsonl` 一类路径。

### Buildr 现有交互契约（以 Codex 为主参照，Qoder CN 为协议样板）

- 契约：`AgentExecutor` / `AgentRuntime` / `ExecutorEvent`（`contracts.ts`）。`send()` 在终态后才返回，事件经 `onEvent`；送达前拒绝抛 `ExecutorInputRejected`；`accepted` 绑定执行身份；`completed` 之后必须再发终态 `observation`，运行才结束。
- 条目合并键为 `参与者:kind:id`，同键原地覆盖、新键按首次出现排序；正文必须发累计全文；已完成工具不被迟到的运行中更新覆盖。
- 工具之间的过程说明依赖“每段正文有独立 id + 工具条目把正文隔开”；前端把运行中或非最终的助手正文渲染为过程说明，相邻工具合并为工具组，最后一段正文提升为最终回复，`thinking` 不进入可见流。工具卡片类别按 `name`（`command`、`read`、`edit`、`file-change`、`grep`、`web_fetch` 等）与 `input` 中 `file_path`/`path`/`command` 推导。
- 交互政策要求工具执行前给出简短说明；Codex 以 `developerInstructions` 注入，Qoder CN 当前未注入（已知缺口，本变更不沿袭）。
- Qoder CN 的 ACP 实现提供了分段、思考、工具、计划、审批、表单提问、终态帧丢失兜底、停止与断连的可复用模式；其缺口：无持久历史读取、无标题读取、工具名未标准化、断连不进入传输中断恢复。
- 现有原生运行时由连接级 `ConnectionApplication.runtime(id)` 每连接一个，被该连接的全部对话共享；网关运行时按租约身份区分。因此按对话隔离必须由执行方在运行时内部按对话管理子进程实现。
- Claude Code 接入的已知问题（后台续跑误判空闲、流式片段未合并、会话身份按目录过滤、用量取中间值）作为反面清单。

## Goals / Non-Goals

**Goals:**

- 达到 Codex 级日常交互闭环，并补齐 Qoder CN 的已知缺口（交互政策注入、持久历史、工具名标准化、类型化断连）。
- 进程按对话隔离，停止与权限切换只影响本对话。
- 支持免费、Pro、Ultra Google 个人账号；账号凭据只经官方 `agy` 使用，Buildr 不触碰密钥环内容；旧对话不会在其他账号下执行。
- 新增内容只通过前置变更的声明接入，公共层与前端不新增品牌分支。

**Non-Goals:**

- 不支持 Gemini API Key、Gemini Enterprise、Agent Platform 登录方式。
- 不支持会话分叉、运行中追加（steer）与只结束提问等待；以执行方能力如实声明不可用，追加输入沿用现有“本轮结束后发送”的排队。
- 不提供 Google 账号给其他执行方、不实现多 Google 账号并存、不按档位限制使用。
- 不修复 Claude Code 与 Qoder CN 的既有缺陷。

## Decisions

### D1 执行方声明

```ts
descriptor: { id: 'antigravity', label: 'Antigravity',
  capabilities: { text, images, approval, questions, stop, resume: true,
    supplement: false, endQuestionWait: false,
    interaction: { policy: 'buildr-interaction/v1', nonBlockingQuestions: false },
    permissionModes: ['default','full-access'], maxImageBytes },
  modelPolicy: { account: 'native',
    native: { sourceProviders: ['native-antigravity'], exclusive: true, binding: 'account-identity' } },
  runtimeTraits: { upgradeVerification: 'runtime' } }
```

程序策略：`distribution.kind='manifest'`，清单主机 `antigravity-cli-auto-updater-974169037036.us-central1.run.app`，归档主机 `storage.googleapis.com`，成员 `antigravity`，可执行名 `agy`/`antigravity`，主版本 `1`，`versionDisplay='program'`。

### D2 进程归属：连接级协调者 + 对话级进程

- 连接级运行时（`ConnectionApplication.runtime('antigravity')`）只做协调：持有共享配置根、账号观察、登录与退出、模型目录探针，以及“对话 → 子进程”映射。
- 每个原生上下文（`contextRef`，对应一段 Buildr 对话的参与者）拥有一个 `agy acp` 子进程，由独立 `OwnedControlResource` 以单独进程组持有。键为 `contextRef + 权限模式 + 账号身份 + 程序身份`；任何一项变化都不复用旧进程。
- 同一对话在无未结工具、请求与疑问且键一致时复用进程；空闲回收沿用既有“已采用连接执行结束及时回收、预启动 30 分钟”规则，按对话进程粒度执行。
- 账号观察、`agy models` 目录探针、登录与退出使用协调者自有的短命进程，不与对话进程共享。
- 私有 `HOME` 位于连接配置根，所有子进程共享该目录中的设置与会话记录（原生会话按 ID 区分，不按进程区分）；启动前校验 `settings.json` 的 `autoUpdate:false`。不传 `--disable-telemetry`，保持厂商默认。
- 新增 `credentialScope: 'host-keyring'`，`isolatedEnvironment()` 在 Linux 额外保留 `DBUS_SESSION_BUS_ADDRESS`、`XDG_RUNTIME_DIR`；其他执行方保持 `isolated-dir`。
- 备选：一个进程服务多个会话。否决：取消超时只能杀整个进程组，会误伤其他对话；进程级免审批也会泄漏。
- 备选：`--process-per-session`。否决：子进程由 `agy` 前端进程派生，Buildr 无法证明各会话的进程组归属。

### D3 会话、配置与交互政策

- 新建：`session/new{cwd, mcpServers:[], _meta.antigravity.systemPrompt.append: <交互政策 + 进展语言>}`；Buildr 在参与者绑定数据中保存本次注入的政策版本（政策文本摘要）。
- 恢复：`session/resume`（不回放）；历史读取用 `session/load` 并在回放期间屏蔽实时映射；会话不存在 → `agent_context_unavailable`。
- 政策变化：若实测 `session/resume` 能携带并更新追加提示，恢复时应用当前政策并更新绑定版本；否则当前政策版本与绑定版本不同时，执行方以 `agent_context_policy_changed` 拒绝恢复，公共层沿用“上下文不可用 → 新建上下文”路径开启新原生会话，并在发送前向界面返回提示“本轮将开启新的 Antigravity 会话”；旧历史保留可查看，新会话不得被呈现为原生恢复。该提示通过既有发送前诊断字段承载，不新增界面分支。
- 模型、思考深度：`session/prompt` 前经 `session/set_model` / `session/set_config_option` 应用并回读校验，不匹配抛 `ExecutorInputRejected`，工作输入为零。
- 权限：默认 → 需审批的原生模式；完全访问 → 原生免审批。会话级可设置则用 `session/set_mode` 并回读；只能进程级（`--dangerously-skip-permissions`）则权限模式进入进程键，切换时关闭旧进程、以新参数启动并 `session/resume` 原会话。实测必须证明：进程级路线下以默认权限恢复曾在完全访问中运行的会话，工具请求仍要求审批；若会话会继承免审批，则权限变化时改为开启新原生会话并提示用户（同政策变化处理），并回到规范修订。
- 模型目录：取 `session/new` 返回的模型状态与配置项；无会话时以协调者的 `agy models` 探针读取。

### D4 事件映射（与 Codex 对齐）

| ACP | Buildr |
|---|---|
| `agent_message_chunk` | `message`（助手），累计全文；遇工具、思考或原生消息身份变化结束当前段，新段 id `message:<exec>:<n>` |
| `agent_thought_chunk` | `thinking`，独立 id，不混入正文 |
| `tool_call` / `tool_call_update` | `tool`，id 为 `toolCallId`；`kind` 映射 `execute→command`、`read→read`、`edit/delete/move→edit`（带差异内容时 `file-change`）、`search→grep`、`fetch→web_fetch`、其他→原生标题；`rawInput`→`input`，`locations[0].path` 补入 `input.path`；`content` 文本/差异/终端输出经 `nativePreview` 截断为 `text`；`pending/in_progress→running`、`completed`、`failed`；仅状态更新保留旧名称与输入；`nativeTool:true` 指向原生记录 |
| `plan` | `notice`，id `plan:<exec>`，覆盖式更新 |
| `usage_update{used,size}` | `context-usage`；`PromptResult.usage` 只作计费参考，不作上下文占用 |
| `session_info_update{title}` | `title` |
| `current_mode_update` / `config_option_update` | 刷新可选项；与本轮已应用配置冲突时记录诊断 |
| `available_commands_update` / 回放中的 `user_message_chunk` | 忽略 / 仅用于历史对账 |
| `session/request_permission` | `request{kind:'approval'}`，选项为原生 `optionId`；仅允许一次性允许/拒绝类选项被选中 |
| `elicitation/create` | `request{kind:'question'}`，复用 Qoder CN 表单转换；不可表达 → `cancel` + 诊断 |
| `PromptResult.stopReason` | `end_turn→completed`；`cancelled→stopped`；`max_tokens/max_turn_requests/refusal→stopped` 带诊断；然后发终态 `observation` |

- 高频片段经 `ExecutorEventStream` 40ms 合并，控制事件立即刷出。
- `session/prompt` 应答后、发布 `completed` 前，以原生记录补齐最终正文并核对未结工具；原生记录显示仍在运行（后台续跑）时保持 `running`。
- 终态帧丢失兜底：同时观察原生会话记录的结束标记，沿用 Qoder CN 模式。

### D5 历史、详情与冷读

- `readHistory` 读取原生持久会话（`session/load` 回放或会话记录文件），按会话身份绑定，不按目录过滤；与 Buildr 记录对账时去重。
- `nativeContent` 声明会话记录根与安全路径，提供工具详情读取；`readPersistedExecution`、`readReleasedControl` 依据原生记录与对话进程组状态实现。
- 原生用户消息映射：`accepted.inputItemId` 填原生用户消息 id，或回放时携带 `clientRequestId`。

### D6 停止、断连与释放

- 停止只作用于本对话进程：`session/cancel` → 等待 `stopReason=cancelled`（有界）。
- 报告“已停止”的充分证据只有两种：收到原生取消结算；或终止本对话进程组后核验进程组为空。后者把未结工具标为 `unknown`，挂起审批与提问一并取消。两者都没有时保持 `stopping`/`unknown`，不报告停止。
- 断连：抛 `ExecutorObservationLost`，进入统一传输中断恢复；状态 `unknown`，不重放。
- 释放：`canRelease`、`prepareRelease`、`canReclaimStorage` 以本对话进程组空闲与无未结请求为准。

### D7 Google 个人账号来源

- `native-antigravity`：`connectionId:'antigravity'`，`sharing:{kind:'executor-exclusive', executors:['antigravity'], reason:'受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。'}`，`inference:'none'`，`presentation.vendorLabel:'Google'`，账单入口指向 Google 官方订阅管理页。
- 账号状态：

| 观察 | 来源状态 | 档位显示 | 可发送 |
|---|---|---|---|
| 未登录 | `not-authenticated` | — | 否 |
| 已登录、绑定身份可建立（原生显式账号标识或无显式标识字段时的登录世代身份）、模型目录非空、档位可识别 | `ready` | 免费 / Pro / Ultra | 是 |
| 已登录、绑定身份可建立、模型目录非空、档位不可识别 | `ready` | 档位不可读 | 是 |
| 已登录、绑定身份可建立、模型目录为空 | `failed`（诊断：无可用模型） | 按观察 | 否 |
| 已登录但原生账号字段格式损坏或认证归属不可确认 | `failed`（诊断：身份不可确认） | — | 否 |
| 登录过期 | `expired` | 保留上次 | 否 |

- 绑定身份规则（依据 D11 实测修订）：
  1. 当 `agy` 在 `_meta.antigravity` 等官方字段中返回显式账号标识（如 `account`/`email`/`userId`）时，取其稳定摘要 `agy-account:<sha256>` 作为账号身份；若字段存在但为空或格式非法，判为“身份不可确认”（`failed`）。
  2. 实测 `agy` `1.5.8` 的 ACP 响应（`initialize`、`authenticate`、`session/new`、`session/resume`、`session/load`）仅在 `_meta.antigravity` 返回 `tier{name,id,upgradeUri}`，不公开邮箱或用户 ID（`id_token_email` 仅存于系统密钥环 `jetski-standalone-oauth-token` 内，Buildr 禁止读取）。因此当 `agy` 确认 `oauth-personal` 已登录且未携带账号字段时，协调者在连接私有目录持久化“登录世代身份” `agy-epoch:<uuid>` 作为绑定身份，账号名称展示为“Google 个人账号（`agy` 未公开邮箱）”，并在说明中如实告知：Buildr 内的退出、切换以及经观察到的未登录/过期恢复都会轮换世代并隔离旧对话；若 `agy` 未公开账号标识且用户在终端原位覆盖登录而未经过未登录观察，需在模型页执行“切换账号”以隔离旧对话。
  3. 档位只映射 `_meta.antigravity.tier`（`id` / `name`）中可识别的值，不由模型目录推断。
- 额度：只映射官方可观察字段，否则 `available:false` + 档位 + 官方入口。

### D8 身份核对与账号操作的协调

- **每轮核对**：执行方在每轮工作输入前，经协调者被动探针（设置 `SSH_CONNECTION=1` 阻止未登录时拉起浏览器）读取当前认证状态与绑定身份（短期缓存，不跨登录、退出事件），与参与者 `nativeSource.accountIdentity` 比较：若 `agy` 返回显式账号摘要则直接比对摘要；若为登录世代模式则核对 `agy` 仍处于有效 `oauth-personal` 登录且当前世代一致（任何观察到的未登录/过期都会清除旧世代）。不一致或认证状态不可确认 → `ExecutorInputRejected('agent_model_source_changed')`，零工作输入。
- **连接级发送闸门**：协调者维护 `open | paused(reason)` 闸门；发送在进入执行前检查闸门，暂停时返回明确原因并保留草稿（不进入排队，避免账号切换后自动发出）。
- **退出 / 切换流程**：
  1. 确认对话框列出该连接运行中的对话，说明影响本机 `agy` 登录；
  2. 闸门置 `paused('account-change')`；
  3. 对运行中的轮次执行统一停止；任何一轮未取得 D6 的停止证据 → 中止操作，闸门恢复 `open`，报告未停止的对话；
  4. 关闭全部对话进程，经协调者调用 ACP `logout`；
  5. 成功 → 清除连接私有登录世代，来源转 `not-authenticated`，撤销连接；切换则立即发起新登录尝试；新登录成功、铸造新登录世代（或读取新显式账号摘要）并核对身份后闸门恢复 `open`；
  6. 失败或结果未知 → 重新被动观察：若已未登录 → 按第 5 步清除世代并转 `not-authenticated`；若仍已登录且 `agy` 提供显式账号标识并等于原账号 → 恢复 `open`；若仍已登录但 `agy` 不公开显式账号标识或身份不可确认 → 保持 `paused` 并提供重试（不在无法证明仍为原账号时恢复发送）。
- 停用供应商只改变 Buildr 来源启用状态（保留登录世代与本机密钥环登录），不经过闸门与 `logout`。

### D9 登录与授权地址

- 后端在短命登录进程上调用 `authenticate{methodId:'oauth-personal'}`，通过前置到该子进程 `PATH` 的受控打开器替身（macOS `open`、Linux `xdg-open`、Windows `rundll32` 包装脚本）及 `BROWSER` 捕获 `LoopbackLogin` 生成的官方 PKCE 授权地址，不自动拉起不受控系统浏览器；取消登录发送 `$/cancelRequest` 并终止该短命登录进程以立即关闭本地回调监听。
- 地址只写入该次登录尝试状态（既有 `LoginAttemptView.url`），只在 `waiting-browser` 期间返回；完成、取消、过期或被替代后清除。迟到结果按尝试身份丢弃。地址、授权码、令牌与回调内容不进入对话事件、普通诊断或日志，日志中查询参数脱敏。替身脚本只转交地址，不读取或保存任何凭据。

### D10 前端与运行时投射

- 前端只新增数据驱动内容：档位与“档位不可读”、身份不可确认、退出与切换确认（运行中对话清单与本机影响说明）、闸门暂停提示、新原生会话提示。
- `services/buildr` 无代码改动：`antigravity` 作为未登记但有效的运行时身份已默认使用 `agents-standard`；在 `docs/agent-runtime-adapters.md` 补充宿主说明（单个 `AGENTS.md` 约 24 KB、规则总预算约 20000 词元、超限降级为路径引用）。

### D11 实机核验结论与规范校准（`agy` `1.5.8` `darwin_arm64`）

基于官方清单受管二进制 `agy` `1.5.8`（`darwin_arm64`）在隔离私有 `HOME` 下的真实协议握手、登录流捕获及编译符号/反射结构核验，五项结论如下：

1. **会话载荷、账号身份与档位（触发规范校准）**：
   - `NewSessionResult`（`session/new`、`session/resume`、`session/load`）返回 `{sessionId, models:{availableModels:[{modelId,name,description}], currentModelId}, modes:{currentModeId, availableModes:[{id,name,description}]}, configOptions:[{id,name,description,category,type,currentValue,options:[{value,name,description}]}], _meta}`；`configOptions` 固定暴露 `model`、`thought_level`（`low|medium|high|xhigh|max`）与 `mode`（`default|accept-edits|auto|plan`）。
   - `_meta.antigravity` 由 `TierInfo.Meta()` 生成，结构固定为 `{tier:{name, id, upgradeUri}}`（取自 `LoadCodeAssistResponse.paidTier ?? currentTier`）。
   - `agy` `1.5.8` 的全部 ACP 方法、CLI 子命令及私有目录文件（`settings.json`、`cache/acp-auth-state.json`、`onboarding.json`）均**不公开** Google 账号邮箱或用户 ID；`id_token_email` 仅存在于系统密钥环 `jetski-standalone-oauth-token` 的 `StoredToken` 中。据此已修订 `spec.md` 与 D7/D8：当 `agy` 返回显式账号字段时按账号摘要核对；当 `agy` 未提供显式账号字段但确认 `oauth-personal` 已登录时，采用连接私有登录世代 `agy-epoch:<uuid>` 绑定对话并在退出/切换/未登录观察时轮换，退出结果未知且无显式账号字段时保持闸门暂停。
2. **`systemPrompt.append` 形状与恢复更新（无需放宽规范）**：
   - `NewSessionParams` 接受 `_meta.antigravity.systemPrompt.append`（字符串）；`session/resume` 与 `session/load` 共用 `handleSessionLoad`，入参内嵌 `NewSessionParams` 并调用 `extractAntigravitySystemPrompt` → `SetTurnOverlay` 更新会话级追加提示。因此 `1.5.8` 恢复时可直接注入最新交互政策；当握手未声明 `systemPrompt.append` 支持且政策摘要变化时，仍走 `agent_context_policy_changed` 开启新原生会话并返回“本轮将开启新的 Antigravity 会话”提示。
3. **权限模式与恢复继承（无需放宽规范）**：
   - `session/set_mode` 的 `auto` 模式受账号可用性限制，而进程启动参数 `--dangerously-skip-permissions` 对所有个人账号生效（自动批准非黑名单工具权限，保留 `elicitation/create` 业务提问等待）。该标志仅存于进程内存 `ServerConfig.DangerouslySkipPermissions`，不写入持久会话记录；从完全访问切回默认权限时按进程键重建不带该标志的子进程并 `session/resume`，`SessionState.mode` 回到 `default`，工具调用重新触发 `session/request_permission`（选项仅 `allow_once` 与 `reject_once`）。
4. **登录地址捕获、取消、退出与密钥环共享**：
   - 实机验证 `authenticate{methodId:'oauth-personal'}` 启动本地 PKCE 回调监听并通过 `osappopen/open.Start` 调用 `PATH` 中的 `open`（macOS）/ `xdg-open`（Linux）/ `rundll32`（Windows），受控替身成功捕获 `https://accounts.google.com/o/oauth2/auth` 授权地址且未拉起系统浏览器；`$/cancelRequest` 加关闭短命登录进程可立即终止监听。被动探针设置 `SSH_CONNECTION=1` 时 `browserUnavailableReason` 阻止未登录弹窗，同时已登录密钥环可通过 `trySilentConsumer` 静默通过。
   - `agy` CLI 使用独立密钥环条目 `jetski-standalone-oauth-token`（与终端 `agy` 共享，与桌面 IDE `HostAuthProvider` 分离）；ACP `logout` 同时清除 `cache/acp-auth-state.json` 与该密钥环条目。
5. **会话记录与并发 `session/prompt`**：
   - 私有 `HOME` 下配置位于 `.gemini/antigravity-cli/`，原生历史由 `session/load` 回放与 `.gemini/antigravity/` 记录提供，执行方同步在连接私有目录维护按会话绑定的结构化工具输出索引以支撑稳定的 `nativeContent` 冷读。同一会话运行中再次发送 `session/prompt` 会触发原生 `steer` 改向（审批/提问等待期间则直接报错拒绝），Buildr 声明 `supplement:false` 由公共层排队串行化。

## Risks / Trade-offs

- [`agy` 为预览期产品，ACP 字段可能变化] → 主版本准入 + 握手能力核对；未知更新类型忽略并记诊断；替身固件覆盖 `1.5.8` 实测结构，真实验证覆盖当前版本。
- [按对话进程增加资源占用（单程序约 235 MB 映射）] → 只为活动对话保留进程，执行结束及时回收；协调者探针使用短命进程。
- [系统密钥环单一登录且 `1.5.8` 不在 ACP 公开邮箱] → 停用不触碰登录；退出与切换前说明影响并轮换登录世代；显式账号字段出现时即时比对摘要，未公开时如实提示终端原位换号需执行切换账号，且退出结果未知时保持闸门暂停。
- [登录地址捕获依赖浏览器打开机制] → 通过登录子进程专用 `PATH` 打开器替身捕获 PKCE 地址，替身只回传地址不处理凭据。
- [账号额度不透明] → 只展示官方可观察事实，不估算。

## Migration Plan

新增执行方与来源，不改变既有数据。上线后用户需主动准备程序与登录。回滚时移除执行方注册与来源；受管程序目录与私有配置保留在本机数据根，不影响其他执行方。

## Open Questions

无未决问题（D11 实机核验已完成并回填）。
