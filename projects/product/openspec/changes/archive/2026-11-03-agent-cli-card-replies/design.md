## Context

见 proposal.md。现有 CLI 有六个子命令，reply 仅字符串；continue 拒绝未回答问题。服务 waitingHandoff 已维护原问题身份、持久投递、独立上下文与旧执行善后。

## Goals / Non-Goals

目标是复用相同 HTTP 与原执行身份，新增结构化 answer 和同对话新轮次。不增加任务写入、账号切换、服务重启或第二套模型投递机制。

## Decisions

1. reply 的 --option/--other 可重复，等号只切分第一处，问题与选项使用稳定 ID。--answer-json 明确解析 JSON；原文本即使像 JSON 也保持字符串。三种输入方式互斥，观察后按卡片校验再提交。
2. send 使用 --conversation 与 --skip-questions 配对，复用原执行配置。continue 保持空闲语义，避免旧调用静默终止卡片。普通 send 保持创建新对话；移除 --connection 参数，仅选择唯一 enabled 且 ready 连接，多个时明确报错；旧调用需要删去该参数。
3. waitingHandoff 增加 new-turn，同连接也可开启新轮，原生会话选择复用当前统一调度；不借用 discussion，避免把新任务限制为解释调查。必须没有 answers 且文本非空，沿用相同执行组合，保存准确原问题集合。旧问题记录明确为未回答，继续遵守缺少必要业务决定时不能代答。
4. 复用 pending-send；预览成功不代表已投递，返回真实待发送状态。冲突/未知结果不重放，用户通过 read 核对。

## Risks / Trade-offs

- 新 CLI 连接旧服务不支持 new-turn → 服务拒绝，明确保留错误，不自动降级或重启。
- 观察后卡片变化 → 当前 revision 与完整身份校验拒绝。
- 跳过不等于回答 → 历史明确记录放弃回答，不生成 reply 收据。

## Migration Plan

无数据迁移；测试在隔离数据目录执行。本轮仅交付候选代码，不安装共享运行时或重启服务。

## 本轮扩展决定

- CLI supplement <conversation-id> <message> 观察原轮并用准确执行身份调用已有 supplement；不创建对话、不把补充当成卡片答案，不自动退化为 send。send 移除 --model 与 --connection，已有对话沿用原配置。
- CLI replay <conversation-id> <event-id> 调用当前服务的 webhook-replay；只允许匹配 workspace/conversation 的持久事件，原样重放同一 eventId，不重做模型或业务动作。
- 七类统一事件的 envelope 包含 eventId、conversationId、agent.name/id、machine、eventType、summary、timestamp。machine 是 os.hostname()，agent.name=Buildr，agent.id 在实例私有数据根持久生成，独立于执行器/模型/进程代次。
- task_started、status_changed、reply 是轻量元数据；reply 只有 entryId/sequence/status，正文不推，read 为正文权威。问题、审批、完成和失败立即入队，审批命令不外发，卡片关闭只表示未再等待，不推断同意。全部厂商使用相同投影。
- 新增 Webhook 专属 SQLite 持久日志与投递队列（不属于任务数据），事务保存投影游标与事件，避免重启重复生成。持久记录目标配置摘要，不存秘密；配置变化不把旧事件自动发到新目标。
- 并发有界，单次请求5秒、禁止重定向，仅2xx确认。失败无限期指数退避（1秒至5分钟）并保留同一事件；进程共享领取租约，崩溃后租约到期重新发送。关闭只取消请求，不丢弃持久未确认事件；启动扫描对话恢复未投影的当前状态。
- 成功事件保留供 eventId 显式重放；重放不改正文，不接受客户端伪造 envelope。接收端原样转发附加字段，不判断业务、不控制投递。响应丢失仍可能产生同 eventId 的重复到达，协议是至少一次，不宣称网络恰好一次。

## 验证补充

覆盖七类事件及必填字段、实例跨重启稳定及不同目录隔离、主机名、200段流式正文不推、卡片即时事件、非2xx/断线重试、队列超旧容量不丢、重启补推、租约及 eventId 作用域重放。验证只用隔离临时数据和本机测试 HTTP。

## 采用与兼容边界

采用新契约时接收端按七类事件及实例 UUID 识别生产者，通过 read 获取回复正文，不再依赖 conversation_updated。已有配置文件和认证方式保留；新增私有 webhook-events.sqlite，不迁移或修改任务及原对话记录。源投影按实例与对话共享，不因更换通知目标重置；目标配置摘要仅限制投递与重放，旧目标历史不会重新生成给新目标。事件 sequence 与回复 entrySequence 分开，避免回复元数据覆盖事件顺序；相同 entryId 只首次可读时通知，后续状态元数据不制造第二次 reply。
