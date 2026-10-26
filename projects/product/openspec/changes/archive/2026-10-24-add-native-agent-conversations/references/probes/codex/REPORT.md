> 历史讨论与实验记录：保留原结论和当时边界。实现现状以正式规范、当前架构说明及交付报告为准；一次性附件和运行资源已在本次交付清理，不作为当前运行依赖。

# Codex 独立接入验证结果

日期：2026-10-22。所有持久写入仅位于本目录；未修改 Buildr 正式功能、共享账号或共享配置。

结论：独立应用服务（App Server）能够基于本机目录和原生规则、技能完成真实模型工作，并在服务重启后恢复原对话。**停止当前轮次必须与停止该轮命令分别处理：仅 `turn/interrupt` 不能证明子进程停止；补充按 `processId` 精确终止已实测可收束。**

## 版本与运行方式

- 真实模型验证程序：`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，`codex-cli 0.163.0-alpha.11.1`。
- 标准输入输出（stdio）独立进程；独立配置目录（CODEX_HOME），未接管桌面服务或已有对话。
- 真实模型：运行时可用列表中的 `gpt-6-luna`，推理强度 `low`；未改用户默认模型。
- 另在本目录安装公开稳定包 `@openai/codex@0.163.0`，仅核对版本和生成协议；没有以该版本重复模型验证。
- `schema/`、`schema-experimental/` 是实际验证版本生成的协议；`public-schema/` 是公开稳定版协议。

## 执行矩阵

| 验证项 | 实际结果 | 证据 |
| --- | --- | --- |
| 独立服务初始化 | 通过 | `evidence/01-isolated-inspection.jsonl` |
| 独立目录的账号状态 | 新目录明确未登录；官方登录后读取到 ChatGPT 账号 | `evidence/login-status.json` |
| 配置来源 | `config/read` 指向临时配置目录，无共享用户配置 | `evidence/inspection.json` |
| 合成规则发现 | `thread/start.instructionSources` 返回合成 `AGENTS.md` | `evidence/inspection.json` |
| 合成技能发现 | 原生发现 `.agents/skills/synthetic-proof` | 同上 |
| 模型遵循规则与技能 | 原生工具读取技能文件；创建 `proof.txt`；回复给出仅规则中存在的 `RULE-CEDAR-42` | `evidence/integration.json` |
| 实际 Buildr 目录发现 | 原生发现根 `AGENTS.md` 和 46 项技能；无模型轮次、无正式目录写入 | `evidence/actual-buildr-discovery.json` |
| 跨目录读取 | 模型及独立原生命令均读到兄弟目录的 `SIBLING-MAPLE-91` | `evidence/integration.json`、`evidence/native-boundary.json` |
| 未授权跨目录写入 | 独立原生命令真实返回 `PermissionError`，目标文件不存在 | `evidence/native-boundary.json` |
| 明确授权跨目录写入 | 模型在增加 `writableRoots` 后写入 `AUTHORIZED-OAK-57` 并读回 | `evidence/integration.json` |
| 创建、命名、列表、历史 | 通过；列表包含记录的原生对话标识 | 同上 |
| 仅中断当前轮次 | 返回 `interrupted`，但前台命令仍存活、心跳从4行增长到19行；不能认定全部停止 | 同上及 `03-real-model.jsonl` |
| 中断后精确终止命令 | `thread/backgroundTerminals/terminate` 返回 `terminated: true`，对应操作系统进程消失，3秒无后续写入 | `evidence/exact-native-stop.json` |
| 停止后继续同一对话 | 无工具准确回复 `STOP-CONTINUATION-OK` | 同上 |
| 重启服务后恢复 | 相同原生 `threadId`，3条既有轮次标识完全一致；追加轮次准确回忆已写入标记和此前结果 | `evidence/integration.json`、`04-restart-resume.jsonl` |
| 善后 | 所有自有服务已退出；认证缓存已删除；保留证据无JWT匹配 | `evidence/final-cleanup-audit.json` |

负向写入的模型轮次最终报告被阻止且没有创建目标文件，但协议流未出现该失败尝试的独立 `commandExecution` 条目。因此不把模型文字单独当作实际调用证明；沙箱拒绝由额外执行的原生 `command/exec` 及其真实错误证明。

## 账号验证的两条实际路径

首轮完整模型验证使用用户完成的**官方独立浏览器登录**。`CODEX_HOME` 目录权限0700，账号信息仅保存脱敏类型/套餐，未读取浏览器成功页内容或保存成功页链接。完成该轮后按约定删除临时 `auth.json`。

停止补测时，按追加授权使用官方文档支持的**认证缓存格式快照**：仅把现有 `auth.json` 快照放入同一独立目录，权限0600，没有复制其他配置。先核对访问令牌仍有效、`last_refresh` 未达到陈旧阈值；不调用刷新或登出，不写回共享文件。补测前后共享源和临时缓存 SHA256 全部相同，未观察到刷新写入；结束立即删除快照。该路径仅是本次验证手段，不据此推荐产品自动复制凭据。

实际生成的 `chatgptAuthTokens` 协议在桌面内附版本和公开稳定版都标注仅内部使用，与在线文档的实验接口描述存在差异。此次没有调用它，也没有构造缺少字段的伪认证缓存。

官方原生诊断数据库会保留包含登录回调令牌的记录；此次发现后删除了本测试目录中的 `logs_2.sqlite` 及附属文件，复现脚本也增加了清理。保留的协议日志始终脱敏，最终扫描无令牌匹配。这说明产品不能直接透出提供者原始诊断日志。

## 停止路径的实测依据

第一次真实命令为 `/bin/zsh -lc '/usr/bin/python3 ticker.py'`，无 `&` 或后台启动语法；`source=unifiedExecStartup`，原生 `processId=34132`。中断轮次后操作系统子进程仍写入；本测试仅清理了自己的该进程。

补测命令同样前台执行，原生 `processId=9663`。顺序为：

1. 等待真实命令开始与至少3次心跳。
2. `turn/interrupt`，接收 `turn/completed.status=interrupted`。
3. `thread/backgroundTerminals/list` 确认该命令仍存在。
4. `thread/backgroundTerminals/terminate` 精确提交原 `threadId` 与 `processId`。
5. 返回 `terminated: true`；对应进程消失，心跳3秒不增长，终端列表为空。
6. 同一对话继续新轮次成功。

这次补测没有调用全对话 `clean`，也没有使用操作系统强杀兜底。正式适配应记录轮次对应的命令标识；终止响应、命令完成事件和实际终端状态要共同决定停止是否完成。任意自行派生或脱离进程组的后代进程未在本轮全面覆盖，不能把本结果扩大为所有可能程序均被收束。

## 其他接入差异与局限

- 起始目录不等于读取边界。本次原生写入边界另由权限确定；负向测试显式关闭 `/tmp` 与系统临时目录的隐式可写权限。
- `skip_host_skill_discovery=true` 下仍发现本机 Tabbit 技能。真实模型测试前在临时配置中通过原生 `skills/config/write` 禁用全部非合成技能，并重新确认有效列表。
- 本机独立服务创建的对话返回 `source: vscode`，不能只按 `appServer` 来源判断归属；需要保存自有原生对话标识。
- 实际 Buildr 目录只验证原生发现；真实执行使用同形合成目录。尚未对真实 Buildr 任务执行端到端验收。
- 归档、删除、图片、插件、外部系统与多并发对话不在本轮验证范围。

## 复现脚本

- `python3 probe.py`：无账号初始化检查。
- `python3 probe.py login`：官方独立浏览器登录；等待有界，链接不记录到证据。
- `python3 run_integration.py`：完整真实模型与恢复验证，结束删除本地临时认证。
- `python3 stop_followup.py`：已有独立登录时精确停止补测。
- `python3 stop_followup.py --approved-cache-snapshot`：仅在另行获得相同认证缓存使用授权时采用；完成或失败均删除快照。

## 可交付白名单

- `REPORT.md`
- `probe.py`、`run_integration.py`、`stop_followup.py`
- `evidence/inspection.json`、`evidence/login-status.json`
- `evidence/actual-buildr-discovery.json`、`evidence/native-boundary.json`
- `evidence/integration.json`、`evidence/exact-native-stop.json`、`evidence/final-cleanup-audit.json`
- 必要原始脱敏协议：`evidence/03-real-model.jsonl`、`evidence/04-restart-resume.jsonl`、`evidence/08-exact-native-stop.jsonl`

不交付原生运行目录、原生诊断日志、认证文件、下载缓存或安装包。协议声明如需保全，只选 `schema-experimental/v2/ThreadBackgroundTerminalsTerminateParams.json` 与两版 `LoginAccountParams.json`，不需要保存整套生成物。

## 官方参考

- [应用服务（App Server）](https://learn.chatgpt.com/docs/app-server)
- [认证（Authentication）](https://learn.chatgpt.com/docs/auth)
- [可信环境中的认证缓存维护](https://learn.chatgpt.com/docs/auth/ci-cd-auth)
