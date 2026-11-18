## 1. 前置与实机核验

- [x] 1.1 确认 `agent-executor-capability-policy` 已完成并合入本工作树；验证：其 `tasks.md` 全部勾选且四服务单元测试通过
- [x] 1.2 用官方清单受管 `agy`（`1.5.8`）在隔离 `HOME` 下完成真实握手、登录流捕获与二进制协议结构核验（design D11 五项结论），结论回填 `design.md`，并据此生成替身 ACP 固件的载荷样本（真实账号交互登录归入 7.4）；验证：D11 各项有实测结论，样本不含凭据与真实授权令牌
- [x] 1.3 依据 1.2 中账号身份、提示更新、权限继承三项结论核对 `specs/antigravity-cli-execution/spec.md`；不符时修订规范与设计并重新执行 `openspec validate --strict`、冲突预检与方案审查；验证：规范与实测一致，修订（如有）已通过复审

## 2. 程序与进程骨架

- [x] 2.1 在程序策略登记 Antigravity 清单分发（平台映射、清单与归档主机白名单、`tar.gz` 成员与 Windows 二进制、主版本 `1`），准备后写入私有 `settings.json` 的 `autoUpdate:false`；验证：替身清单下的准备、发现、绑定测试通过，运行后受管程序身份不变
- [x] 2.2 增加 `credentialScope: 'host-keyring'` 声明与 `isolatedEnvironment()` 的 Linux 密钥环会话变量保留，其他执行方环境不变；验证：环境构造单元测试覆盖三平台与既有执行方回归
- [x] 2.3 新建 `src/executors/antigravity/`：声明 descriptor、`modelPolicy`（`account-identity`）、`runtimeTraits`、`nativeContent`；实现连接级协调者与按 `contextRef + 权限 + 账号身份 + 程序身份` 管理的对话级 `agy acp` 子进程（各自 `OwnedControlResource`），协调者探针使用短命进程；验证：替身固件的握手、能力缺失、双对话各自进程组与回收测试通过

## 3. 会话与执行

- [x] 3.1 实现 `createContext`/`resumeContext`/`prepareContext`：`session/new` 注入交互政策并在绑定数据记录政策版本，`session/resume` 恢复，按 1.2 结论在政策变化时更新提示或以 `agent_context_policy_changed` 开启新会话并返回发送前提示，缺失会话抛 `agent_context_unavailable`；验证：新建携带政策、政策未变正常恢复、政策变化提示并新建且旧历史保留的测试通过
- [x] 3.2 实现模型、思考深度、权限模式的应用与回读校验；完全访问按 1.2 结论走会话级或进程级（权限进入进程键、切换重建进程）；失败抛 `ExecutorInputRejected` 且工作输入为零；验证：默认/完全访问往返切换后工具重新要求审批、非法模型拒绝的测试通过
- [x] 3.3 实现每轮输入前账号身份核对（经协调者、缓存不跨登录退出事件），不一致或不可确认抛 `agent_model_source_changed`；验证：替身模拟终端侧换号、身份不可确认时零工作输入并提示重新选择模型
- [x] 3.4 实现 `send`：`accepted` 绑定、`session/prompt`、D4 全部事件映射、`ExecutorEventStream` 合并、最终正文补齐与未结工具核对、后台续跑保持运行、`completed` 后终态 `observation`；验证：替身固件覆盖“说明→工具→说明→工具→最终正文”、思考、计划、命令输出、失败工具、仅状态更新、截断/拒绝/上限、终态帧丢失
- [x] 3.5 实现审批与提问：权限请求映射与准确选项回传（禁止持久授权）、表单提问转换与验证回传、不可表达提问取消；验证：审批允许/拒绝、非法选项保留请求、单选/多选/自由输入、完全访问下提问仍等待的测试通过
- [x] 3.6 实现图片输入、上下文用量与标题（`session_info_update` 与 `readTitle`）；验证：图片超限拒绝、`usage_update` 投射且计费汇总不投射、标题事件测试通过

## 4. 停止、断连、历史与冷读

- [x] 4.1 实现按对话 `stop`（取消、有界等待、仅终止本对话进程组并核验为空、未结工具 `unknown`、挂起请求取消）与断连 `ExecutorObservationLost`；验证：长命令停止、取消无回执超时、两段对话并发时停止一段另一段不受影响、连接断开不重放的测试通过
- [x] 4.2 实现 `readHistory`（按会话身份、回放屏蔽、去重）、原生用户消息映射、`nativeContent` 工具详情、`readPersistedExecution`、`readReleasedControl`、`canRelease`/`prepareRelease`/`canReclaimStorage`；验证：重启后恢复历史不重复、工具详情越界与错误会话拒绝、存储生命周期全执行方测试通过

## 5. Google 个人账号来源与账号操作

- [x] 5.1 新建 `src/model-access/providers/antigravity.ts`：托管登录来源、`sharing` 仅供 Antigravity、`inference:'none'`、`presentation` 与官方入口、design D7 状态表（含免费、档位不可读、身份不可确认、模型为空、过期）、额度如实不可读；在 `agent-service.ts` 通过声明装配；验证：状态表逐行测试、其他执行方不可选与拒绝签发租约测试通过
- [x] 5.2 实现登录尝试：官方认证、浏览器替身或授权码流程、地址只在 `waiting-browser` 期间经 `LoginAttemptView` 返回、完成/取消/过期/替代后清除、迟到结果丢弃、日志脱敏；验证：登录状态机测试与日志脱敏断言通过，对话事件中不出现授权地址
- [x] 5.3 实现连接级发送闸门与退出、切换流程（design D8：确认清单、暂停、停止在跑轮次、停止失败中止并恢复、`logout`、切换后新登录、失败或未知时重新观察身份）与停用；验证：有对话运行时切换、停止未证明时中止、退出超时后按身份恢复或保持暂停、暂停期间发送被拒且不进入排队、停用后重新启用无需登录的测试通过，代码中无密钥环直接访问

## 6. 界面

- [x] 6.1 智能体页展示 Antigravity 准备进度、版本检查与登录；模型页展示 Google 账号卡片（账号、免费/Pro/Ultra/档位不可读、身份不可确认、模型、额度说明与官方入口），提供停用、退出、切换，确认中列出运行中对话并说明影响本机 `agy` 登录，暂停期间显示进行中状态；验证：组件测试覆盖各状态与确认文案，无新增品牌分支
- [x] 6.2 对话中可选择 Antigravity 与该账号模型，其他执行方显示不可选原因；账号变化、闸门暂停与“本轮将开启新的 Antigravity 会话”提示在发送前可见；过程说明、工具组、最终回复、审批与提问卡片按既有组件呈现；验证：前端单元测试与开发预览中的页面操作核对

## 7. 运行时投射、知识与验证

- [x] 7.1 更新 `services/buildr/docs/agent-runtime-adapters.md` 宿主说明与 Buildr 技能中的智能体接入指引（`antigravity` 使用 `agents-standard`）；验证：`buildr sync antigravity --target <workspace>` 与 `buildr doctor --agent antigravity` 在开发检出中返回标准投射结果
- [x] 7.2 更新 `knowledge/docs/architecture/agent-integration.md`（Antigravity 执行路径、按对话进程隔离、Google 个人账号来源与凭据边界、账号切换协调）、`knowledge/docs/overview.md` 与 `knowledge/docs/glossary.md` 中受影响的接入列表与术语，同步 `.buildr/knowledge-impact.yml`；验证：文档与实现事实逐项核对
- [x] 7.3 运行四服务静态检查与单元测试、`buildr-agent` 集成测试，执行 `openspec validate antigravity-cli-integration --strict`；验证：全部通过
- [x] 7.4 完成开发预览页面与官方清单实机核对（智能体接入卡片、官方 `manifests/darwin_arm64.json` 实时读取与 `1.5.8` 归档解包校验、Google 个人账号卡片、未准备程序登录防呆导流、对话选择器独占过滤），并由集成测试覆盖多轮工具过程说明、审批与提问、双对话并发停止、完全访问往返、重启恢复、终端换号拒绝、停用重启用及退出/切换协调；需真实 Google 个人账号交互登录的实机运行项按用户收尾决定移交 `Buildr Web Dev` 人工验收并在任务验证报告 `gaps` 中如实登记
