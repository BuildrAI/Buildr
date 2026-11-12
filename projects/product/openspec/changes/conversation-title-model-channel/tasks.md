## 1. 独立标题模型通道

- [x] 1.1 在 Qoder 原生模型适配器中抽出可复用的目录选择与 chat completion 聚合（复用现有 `/models` 解析与 SSE 聚合），并验证 `model-titles` 相关单元测试通过
- [x] 1.2 新增 Qoder 原生标题请求：用 `generateModelTitle` 的提示与解析，经 `/chat` 发送无工具、128 token、可取消的一次请求；用注入的假 `request` 验证目录选择、请求体与标题解析
- [x] 1.3 Qoder 执行器的 `generateTitle` 改为走原生 `/chat` 标题请求，不再绑定工作会话；验证 executor 层测试不再出现 `generate_session_title`
- [x] 1.4 Qoder-CN 执行器保留网关路径，并在无网关时走原生 `/chat`；验证无网关不再返回 `agent_title_unavailable`
  - 无网关且原生账号未就绪时仍按能力不可用返回 `agent_title_unavailable`；账号可用时走原生 `/chat`
- [x] 1.5 删除 qodercli 会话内标题实现（`executors/qoder/title.ts`、worker 的 title/cancelTitle 分支及相关测试），验证静态检查与剩余测试通过

## 2. 对话标题流程

- [x] 2.1 输入受理后写入首条消息兜底标题，新增 `titleOrigin=fallback` 与 `titleState.status=fallback`；验证受理后无需模型即出现兜底标题
- [x] 2.2 自动智能标题改为仅首个轮次成功完成后尝试一次，外层预算收敛到约 10 秒；验证第二个轮次、刷新与重启不再触发自动请求
- [x] 2.3 自动失败保留兜底标题并记录 `failed|unavailable` 与脱敏原因，不再写失败提醒标题；验证失败后标题仍为兜底文本且状态可解释
- [x] 2.4 删除早期会话绑定尝试、`earlyTitles`、按参与者尝试记账、`titleDiagnostics` 及对应领域字段；验证运行时与服务关闭路径不再引用这些状态
- [x] 2.5 删除 `listInterruptedTitles` / `listTitleFailureCandidates` 与重启标题扫描；读取时把无活动任务的 `generating` 归一为失败展示；验证重启后不再出现持续生成中
- [x] 2.6 保留显式“生成简短标题”与手动改名优先；更新 `conversations.test.ts` 的标题用例覆盖兜底、单次尝试、失败保留、改名竞争，并验证集成测试通过
  - 标题相关用例通过；`conversation-unknown-settlement` 为 `dev` 同样存在的基线失败，与本变更无关

## 3. 界面状态

- [x] 3.1 更新 buildr-web 标题状态标签与提示（`pending/generating/generated/fallback/failed/unavailable/manual/unknown`），失败文案不再指向失败提醒标题；验证前端类型检查与相关界面测试通过

## 4. 文档、验证与知识影响

- [x] 4.1 更新 `openspec/specs/agent-conversations` 外的相关说明或术语（如有），并同步 `.buildr/knowledge-impact.yml` 与受影响的代码地图/技术图；验证影响清单与实际改动一致
- [x] 4.2 运行受影响服务的静态检查与单元测试，以及 Qoder / Qoder-CN 原生标题的真实调用验证；记录实际结果与失败原因
  - 已执行：agent 静态/类型检查、单元测试、`agent-integration` 与 `agent-integration-native`；web 类型检查与前端逻辑测试；buildr 受影响集成用例单独复跑
  - 真实调用：使用本机已登录的开发账号，以合成资料、128 token、20 秒上限各调用一次 Qoder 与 Qoder-CN 原生 `/chat` 标题通道，均返回有效标题（`生产鲜肉销售单解冻节点变更`、`修改鲜肉销售单解冻节点`）
  - 未重跑：dsh-plugin 未被本变更修改，按影响范围未执行其检查；浏览器旅程中 `handoff` 与 `history/turn-timing` 两个未修改场景在 10 秒等待处超时，失败点不涉及标题或改名链路，按并发/环境超时记录，未重复重跑
