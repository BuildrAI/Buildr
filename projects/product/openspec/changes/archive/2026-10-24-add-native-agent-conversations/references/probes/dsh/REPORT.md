> 历史讨论与实验记录：保留原结论和当时边界。实现现状以正式规范、当前架构说明及交付报告为准；一次性附件和运行资源已在本次交付清理，不作为当前运行依赖。

> 公开路径脱敏：仅将本机用户目录替换为 `<user-home>`；原运行结果、时间及结论保持不变。

# DSH 独立接入真实验证

日期：2026-10-22（Asia/Shanghai）。范围为临时实验，不修改 Buildr 正式功能，不接管外部桌面会话。

## 结论

DSH 0.2.1-rc.2 的独立 Web Host 能由 Buildr 式 Node.js 调用方通过官方连接、网关及生成的远程接口（Remote API）完整执行真实模型工作。已实测账号可用、规则与技能加载、跨目录读写和原生权限回调、取消真实执行、进程重启后的同会话历史读取与继续对话。

真实运行不是替身模型：使用 `deepseek-account / deepseek-flash`，共 9 个模型执行轮，其中 1 个由实验客户端取消。

## 版本与接入

- Host：`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`，`--version` 为 `0.2.1-rc.2`。没有启动或控制现有 Desktop，只使用其随附独立命令行入口（CLI）。
- Host 命令：`dsh web --no-open --port 0`，当前工作目录（cwd）、`DSH_HOME`、`DSH_AGENTS_HOME` 均显式指定实验目录。
- 客户端：Node.js `v24.21.0`，`@deepseek-ai/cordis` `4.0.5`；DSH 连接、网关、类型注册与生成接口包全部固定 `0.2.1-rc.2`。其余精确版本见 `package.json` 和锁文件（Lockfile）。
- 机器连接：启动令牌（Token）和连接 Cookie 仅保存在后端进程内存。`GET /connect?token=…&interactions=answer` 后使用官方 `installConnection`、Gateway 和各包 `/remote` 生成模块。
- 发现一项实际接入差异：`dsh-api-remotes/client` 总入口是浏览器构建，直接在 Node 中导入会因 `window` 不存在失败；逐个挂载官方 `/remote` 模块成功，不需要复刻协议。
- 首次客户端使用了错误的 Cordis 生命周期方法 `ctx.start()`；改用当前实际生命周期 `ctx.fiber.dispose()` 后完成整个验证。失败记录保留，未混入通过结论。

## 账号与隔离

- 无账号的独立 Host 成功启动，`account.getState()` 返回 `signed-out`，模型目录为空，仍能创建和列出会话。
- 真实账号测试只读取本机官方凭据文件中的 `deepseek-account-platform/default` 单条授权（Grant），临时保存到权限 0700 的独立 `DSH_HOME` 下 0600 凭据文件，未复制整个长期凭据文件、设备身份或机器连接秘密。
- 该记录只有 `version / token / issuer`，没有刷新令牌（Refresh Token）；该版本官方 DeepSeek 账号实现也没有刷新流程。本实验只调用账号状态、资料和模型接口，没有调用登录、退出、刷新、密钥修改接口。没有独立捕获完整网络流量，不能将本机文件摘要相同扩大为对所有服务端副作用的证明。
- `getProfile()` 实际返回 `ready`，模型目录实际包含 `deepseek-flash`、`deepseek-v4-pro`。证据只保留状态，不保存账号姓名、联系方式或余额。
- 长期凭据文件在账号准备和资料查询前后 SHA-256 摘要相同；后续 Host 仅指向独立目录。
- 已通过官方设置接口关闭实验会话上传；首个模型轮开始前生效。没有装载真实 `~/.agents` 业务技能或外部插件。
- 最终清理独立账号与运行目录，不执行远端退出（Logout），以免影响原账号。

## 验证矩阵

| 能力 | 实测结果 | 证据或限制 |
|---|---|---|
| 独立服务与客户端 | 通过 | 独立端口、官方握手、`interactions=answer` |
| 无账号创建会话 | 通过 | 创建、列表、空模型目录均成功 |
| 真实账号可用 | 通过 | `credential-stored` 且 `getProfile=ready`，随后真实模型成功 |
| 根 `AGENTS.md` | 通过 | 实际模型上下文包含源码规则，回答隐藏合成标记 `RULE_DSH_6281` |
| 本地技能（Skill） | 通过 | 目录只列出合成 `integration-probe`，模型实际调用 `skill` 工具并回答 `SKILL_DSH_4817` |
| 嵌套规则 | 通过 | 原生 `read` 后注入 `nested/AGENTS.md` 并回答其合成标记 |
| 跨目录读取 | 通过 | 原生 `read` 读取兄弟目录标记，无需把兄弟目录设为 cwd |
| 兄弟工作根规则自动发现 | **未自动发生** | 直接读取兄弟目录文件没有注入该根 `AGENTS.md`；跨工作空间应由智能体主动读取目标规则，不能假设自动继承 |
| shell `cd` 发现嵌套规则 | **未发生** | 单纯 `cd` 后 `cat` 无新规则事件；后续原生 `read` 才有新规则事件 |
| `/tmp` 兄弟目录写入 | 成功，但不是边界证明 | `workspace-write` 包含平台临时目录例外，首次所谓拒绝探针实际写成功，原始事实保留 |
| 非临时兄弟目录无额外权限写入 | 通过 | 缓存场地经真实路径和非 Git 归属检查；一次普通 `write` 被拒绝，文件不存在 |
| 非临时兄弟目录单次批准 | 通过 | 模型普通调用被拒后以 `danger-full-access` 单次升级；`approval/request` 回调收到精确目标，允许一次，文件内容核验成功 |
| 取消真实执行 | 通过 | 前台命令已写开始标记并进入 30 秒睡眠，调用 `session.cancel` 后 `turn/end=aborted(user)`，工具返回 `ABORTED` |
| 取消后无迟到写入 | 通过 | 等待 32 秒后结束标记仍不存在 |
| Host 重启恢复 | 通过 | 停止本实验 Host，再启动新端口；相同 sessionId 的 `follow/page` 返回 75 条历史 |
| 重启后继续对话 | 通过 | 不重新读取文件，真实模型正确复述此前技能与兄弟文件标记 |
| 真实 Buildr cwd 初始化 | 部分确认 | 零模型轮、无工作空间写入；目录返回 38 个实际工作空间技能，均来自 `<user-home>/workspaces/BuildrAI/Buildr/.agents/skills` |
| 真实 Buildr 根规则注入 | 未执行模型验证 | 创建阶段历史有 0 个规则事件；DSH 在首轮前才注入。只确认真实 `AGENTS.md` 存在，不声称已验证注入 |
| 新账号浏览器登录、注销、API 密钥配置 | 本轮未执行 | 流程支持来自官方代码/文档，不与上述实测混淆 |

非临时合成场地为 `<user-home>/Library/Caches/Buildr-agent-integration-wgc0iS-dsh`，由本实验创建，结束后删除。没有在实际 Buildr 或集鲜工作空间执行模型或改文件。

## 会话与证据

- 真实主要会话：`session-fb306acd-5242-478a-85a2-4a5704968344`。
- 非临时边界会话：`session-2ad279e3-2a6a-4ee7-8b55-4e9567afab52`。
- 真实 Buildr 零轮初始化：`session-de08eb1a-efb9-4b1c-83d8-94735a016b69`。
- `evidence.jsonl`：逐步脱敏结果与状态；`synthetic-turns.json`：第一组真实模型事件；`cache-turns.json`：非临时边界、审批、shell/native 规则对比。
- `skills-catalog.json`、`actual-buildr-skills.json`、`commands.json`、`permission-catalog.json`、`model-catalog.json`：原生发现结果。
- `harness.mjs`、`step1.mjs` 至 `step4.mjs`：实验程序；`cleanup.mjs`：已知秘密匹配检查和自有场地清理。

## 可重复执行

所有程序只写实验目录及明确命名的缓存场地。按顺序运行 `node step1.mjs`、`node step2.mjs`、`node step3.mjs`、`node step4.mjs`，完成后运行 `node cleanup.mjs`。`step2.mjs` 会从本机当前官方登录授权创建临时授权状态，需要在继续获得该范围授权时执行。`step4.mjs` 在场地已存在时拒绝运行，避免覆盖不明内容。每个模型轮有 150 秒上限（停止测试为 60 秒），Host 启动上限为 45 秒；关闭只针对各程序创建的子进程。设置、登录和历史展示失败不会伪装成模型通过。

清理后原生运行目录已移除，因此不能直接再恢复本次原生会话；完整合成事件和会话身份保留在上述证据，脚本可重新生成场地验证。

## 对接方案影响

1. 首版对话框可直接使用这套独立 Host 与原生会话模式，保留 DSH 的模型、权限和历史行为。
2. 工作目录是初始上下文与规则/技能发现锚点；实际访问由原生权限策略另行决定，不能把 cwd 做成 Buildr 新增的全局访问围栏。
3. 原生权限请求、执行中止及恢复都是必须接通的交互，不应把“允许一次”改成静默长期放开。
4. Buildr 不应默认为跨工作空间补造隐藏规则上下文；智能体需要依据目标主动检查目标工作空间规则。
