## Why

用户希望在 Buildr 中直接使用 Google 官方 Antigravity CLI（`agy`）和自己的 Google 个人账号（免费、Google AI Pro 或 Ultra），而不是另开终端或桌面应用。`agy` 已提供官方 ACP（Agent Client Protocol）标准输入输出服务，并原生发现 `AGENTS.md` 与 `.agents/skills`，可以按 Buildr 现有原生执行方规范接入。Google 个人账号的 OAuth 凭据只允许官方客户端使用，因此该账号只能由 `agy` 原生消费，不能经 Buildr 模型网关转给其他执行方。本变更建立在 `agent-executor-capability-policy` 的声明式能力、按账号身份原生直通与清单分发之上，是 [任务说明](@task/antigravity-subscription) 的第二步。

不包含破坏性变更。

## What Changes

- 新增 `antigravity` 原生执行方：按官方发布清单准备 Buildr 独立 `agy` 程序（关闭自更新、不执行官方安装脚本的环境改写），通过 `agy acp` 实现与 Codex 同等的日常交互闭环：流式正文与工具之间的过程说明、思考、工具调用与结果、命令输出、计划、工具审批、业务提问、模型与思考深度选择、默认权限与完全访问、停止、多轮接续、原生历史恢复、标题、上下文用量、图片输入、崩溃与断连后的准确状态。
- 进程按对话隔离：每段对话拥有自己的 `agy` 进程与进程组，同一对话复用；停止与取消超时只影响本对话；完全访问若只能在进程启动时设置，权限切换时重建该对话进程，并实测恢复旧会话不会继承免审批。
- 交互政策（含“每段工具执行前先用简短文字说明”）经官方追加系统提示能力注入；恢复会话无法更新提示时，政策变化后开启新的原生会话并明确告知用户，保留旧历史。
- 新增 Google 个人账号模型来源：由 Antigravity 连接托管官方 Google 登录，支持免费、Pro、Ultra；`agy` 能确认账号身份并返回可用模型即可使用，档位如实显示或显示“档位不可读”；身份无法确认时在发送前拒绝。来源声明仅供 Antigravity 使用且不提供网关推理。
- 账号操作：停用供应商（只在 Buildr 内停用）、退出账号、切换账号；Buildr 发起退出或切换时暂停该连接新发送并处理在跑轮次，失败或结果未知时先重新观察身份再决定是否恢复；每轮发送前核对身份，发现终端侧换号即拒绝旧对话继续执行。
- 授权地址沿用现有登录尝试机制交付，限定访问范围、有效期、取消、迟到结果与脱敏。
- `agy` 登录凭据由其自身保存在系统密钥环；Buildr 不读取、不复制、不改写密钥环内容，Linux 下为原生进程保留访问密钥环所需的会话环境。
- 运行时投射：`antigravity` 作为运行时身份使用既有 `agents-standard`，补充宿主说明，不新增文件适配器。
- 界面：智能体页新增 Antigravity 准备与登录，模型页新增 Google 账号来源卡片（档位、模型、额度说明）及账号操作，对话中可选择 Antigravity 与该账号模型。
- 实施首项为实机核验；账号身份、权限继承与提示更新三项的结论允许据实调整本变更规范。

## Capabilities

### New Capabilities

- `antigravity-cli-execution`：Antigravity 独立程序准备、按对话进程隔离的 ACP 执行与交互闭环、交互政策注入与政策变化处理、Google 个人账号来源与档位、账号停用/退出/切换及其与发送的协调、授权地址交付、凭据边界与资源释放。

### Modified Capabilities

无（执行方接入通用规则沿用 `agent-runtime-connections`，路径与兼容判定沿用 `agent-executor-capability-policy` 引入的要求）。

## Impact

- `services/buildr-agent`：新增 `src/executors/antigravity/`（按对话进程、ACP 会话、事件映射、请求、历史、停止、标题）、`src/model-access/providers/antigravity.ts`（托管登录来源）、程序策略登记、服务装配、连接级发送暂停；复用 `executors/qoder/acp.ts` 的 ACP 客户端与 `OwnedControlResource`；新增替身 ACP 固件与集成测试。
- `services/buildr-web`：Antigravity 连接、Google 账号卡片（档位与“档位不可读”）、退出/切换确认与进行中提示、新原生会话提示（依赖第一步的服务端声明，不新增品牌分支）。
- `services/buildr`：`docs/agent-runtime-adapters.md` 宿主说明与 Buildr 技能中的接入指引；无代码变更。
- 外部依赖：Google 官方发布清单与 `storage.googleapis.com` 归档；`agy` 1.x ACP 协议。
- 依赖前置变更 `agent-executor-capability-policy` 先完成。
