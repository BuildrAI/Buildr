> 历史讨论与实验记录：保留原结论和当时边界。实现现状以正式规范、当前架构说明及交付报告为准；一次性附件和运行资源已在本次交付清理，不作为当前运行依赖。

# Qoder 隔离接入实测报告

观察时间：2026-10-22 21:29–21:50（Asia/Shanghai）。软件开发工具包（SDK）固定为 `@qoder-ai/qoder-agent-sdk@1.0.55`，命令行（CLI）固定为其声明的配套版本 `@qoder-ai/qodercli@1.1.75`，Node.js 为 `v24.21.0`。最初短暂安装 `1.1.76` 读取帮助与源码线索，所有真实模型测试均使用 `1.1.75`。没有使用模型或命令行替身。

**结论：独立官方登录、真实模型执行、合成工作空间规则、技能调用、跨目录权限、提问、单独中断与精确会话恢复均已得到实测证据。必须显式配置 `.agents/skills` 加载，并按实际提问消息结构实现交互。**

## 账号与配置

- 本机原先 PATH 中没有 `qodercli`；已有 `~/.qoder` 不代表已经登录命令行（CLI）。空独立配置及只读探测本机账号源均返回结构化终态 `auth_required`，0 模型轮次。
- 初期探测采用当前分发实现的 `QODER_SDK_AUTH_CONFIG_DIR` 只读指向本机配置。原 `.qoder/.auth` 内文件的大小、修改时间和模式前后不变，源码使用 `initReadOnlyFromStore()` 且不启动刷新。没有复制凭据。此环境变量没有被本次验证为公开稳定接口，正式方案不依赖它。
- 随后获得授权，在独立 `QODER_CONFIG_DIR` 中运行官方 `qodercli login`。命令打印浏览器授权地址，用户完成授权后正常返回登录成功。
- 后续全部真实模型测试只通过公开 `qodercliAuth()` 读取该独立配置，没有设置实验性账号目录覆盖。独立配置可以采用官方命令行（CLI）的浏览器登录，不应预设只能使用个人访问令牌（PAT）。
- `HOME`、`TMPDIR`、`QODER_CONFIG_DIR` 均位于本次实验目录。原有桌面账号未登出、未接管。独立登录凭据曾只在 `config/interactive-login/.auth`，已在测试结束后随本次临时配置清理，不进入交付包。

## 真实验证结果

| 项目 | 实测结果 | 证据 |
| --- | --- | --- |
| 合成规则与读取 | 模型真实读取输入文件，并返回只在磁盘 `AGENTS.md` 中提供的规则标记与输入文件标记。 | `evidence/runtime-smoke.jsonl` |
| 默认技能装配 | 仅 `settingSources` 与 `skills` 时，真实 `Skill` 调用报未注册；虽然回合终态为成功，技能目标未完成。 | `evidence/runtime-skill.jsonl` |
| 显式技能装配 | 加 `settings.skills.loadFromAgentsDirectory=true` 后，真实 `Skill` 调用成功，返回技能、规则和输入三个标记。 | `evidence/runtime-skill-agents-enabled.jsonl` |
| 未扩展目录、拒绝 | 相邻目录 `Read` 触发 `canUseTool`；拒绝后未写入目标文件。 | `evidence/runtime-cross-denied.jsonl` |
| 未扩展目录、允许 | 没有 `additionalDirectories`，分别允许 `Read` 与 `Write` 后，相邻目录读写成功。起始目录不是硬目录边界。 | `evidence/runtime-cross-prompt-allowed.jsonl` |
| 扩展目录、另行授权 | 加入相邻目录后读取不再询问，`Write` 仍因独立 `ask` 规则请求授权，允许后内容正确。 | `evidence/runtime-cross-allowed.jsonl` |
| 提问与回答 | `AskUserQuestion` 触发回调，以 `updatedInput.answers` 回传回答，工具结果和后续模型输出均包含 `amber`。 | `evidence/runtime-question.jsonl` |
| 单独中断 | 真实命令写入 2 行后 `interrupt()`；收到 `still_queued:[]`，终态 `aborted_tools`。关闭前继续观察 2.5 秒：工作负载已退出、写入保持 2 行、命令行进程仍存活。 | `evidence/runtime-interrupt.jsonl` |
| 精确恢复 | 原进程关闭后，新 Node.js 进程恢复同一标识 `5024c6b4-3334-49cf-96bc-afaa012a032e`；无新工具调用即复述前文两个标记并追加新标记，原生历史消息从 7 条增至 10 条。 | `evidence/runtime-resume.jsonl` |
| 实际 Buildr 发现 | 原生技能列表发现 38 项，全部来自真实 `Buildr/.agents/skills/`。 | `evidence/discovery-actual-buildr.jsonl` |
| 实际 Buildr 初始化 | 显式开启目录后，初始化的 `skills` 字段含 38 个 `project` 来源和下述 5 个 `built-in` 来源；上下文统计为 0 提示、0 消息、0 工具调用、0 修改行，模型上下文协议（MCP）服务为空。 | `evidence/initialize-actual-buildr-agents-enabled.jsonl` |

原生历史消息包含工具和助手分片，不能把 10 条消息表述为 10 轮对话。实际 Buildr 只做无输入初始化，没有执行业务任务。

### 中断与关闭的准确顺序

北京时间 21:50:06.615 请求中断，21:50:06.619 收到回执。21:50:08.409 已收到取消终态，工作负载进程 `6164` 不存在，命令行进程 `4239` 仍存活。到 21:50:10.911，写入仍为 2 行，工作负载仍不存在、命令行仍存活，记录 `sdkCloseCalled:false`。此后才退出迭代并调用 `q.close()`，命令行于 21:50:13.806 退出（取消后的退出码为 1）。

旧的先关闭后观察试验单独保留为 `runtime-interrupt-close-first.jsonl`，不用它证明单独中断。最终取消能力的判断来自新试验中关闭前的观察。

## 需要进入适配方案的版本差异

### `.agents/skills` 的开关

本次版本的普通命令行（CLI）默认扫描 `.agents/skills`，软件开发工具包（SDK）模式默认不扫描。实际有效设置为 `settingSources:['project','local']`，以及 `settings:{skills:{loadFromAgentsDirectory:true}}`；`skills:'all'` 或明确名单控制发现之后的可用技能，不能替代目录加载开关。只加 `skills:'all'` 的真实 Buildr 对照仍没有出现 38 个项目技能。

### 初始化技能列表与官方文档不同

[官方技能文档](https://docs.qoder.com/cli/sdk/skills) 声称初始化不会出现 `source:'built-in'`。本次 `initializationResult().skills` 数组实际包含以下精确条目，**不是从 `commands` 数组统计出来的命令**：

```json
[
  {"name":"imagegen","source":"built-in"},
  {"name":"sites:sites-build-agent-app","source":"built-in"},
  {"name":"sites:sites-building","source":"built-in"},
  {"name":"sites:sites-hosting","source":"built-in"},
  {"name":"sites:sites-management","source":"built-in"}
]
```

它们是当前运行时报告的内置来源技能。不能据此声称文档列举的 `simplify/debug/security-review` 等工厂技能也被启用；本轮未观察到那些条目。Buildr 应以实际初始化结果为准。模型试验只允许调用合成技能，实际 Buildr 的全部技能只发现、未调用。

### `AskUserQuestion` 静态类型与实际请求不同

软件开发工具包（SDK）`dist/types/tools.d.ts` 仍描述 `question/options/default`；真实请求却是 `questions[]`，项中有 `question/header/options/multiSelect`，回答为 `answers` 映射。正确回传：

```js
{ behavior: 'allow', updatedInput: { ...input, answers: { 'Choose probe color': 'amber' } } }
```

首次测试脚本额外加入 `answer` 属性，导致工具参数校验失败并达到轮次上限；这是宿主脚本错误，已修正并真实重跑通过。失败证据单独保留为 `runtime-question-invalid-host-payload.jsonl`。

## 限制与清理

- 合成规则由磁盘标记证明生效。`InstructionsLoaded` 本次没有报告启动文件事件；不能把注册该钩子等同于来源观测成功。实际 Buildr 的完整规则效果未通过模型任务验证。
- 未测强杀或断电恢复、所有模型和权限模式、图片附件、外部桌面同时使用同一会话、跨版本兼容、操作系统级沙箱。
- 原生回合 `success` 不是业务验收。独立检查结论在 `RESULTS.json`；取消终态 `aborted_tools` 是预期结果。
- 全部模型进程和登录进程均已结束，自有进程剩余为 0。已删除本次 `config/`、`home/`、`tmp/`，包括独立登录凭据和原生敏感日志；没有远端登出，没有修改原本用户配置。`evidence/final-cleanup.jsonl` 记录最终检查。
- 交付只保全本报告、`RESULTS.json`、脚本、合成 `fixture/`、依赖清单和脱敏 `evidence/`，排除 `node_modules/`。已删除的本机凭据为不透明存储格式，未捕获可逐值比对的真实令牌；对白名单文件执行敏感字段和令牌格式扫描，均为 0 命中。这不是已知令牌逐值匹配的证明。详见 `evidence/final-cleanup.jsonl` 与 `evidence/final-field-scan.jsonl`。

## 复现

从本目录执行，每个模型场景上限 90 秒，初始化上限 30 秒。脚本不自动登录；本次独立凭据已清理，重跑真实模型需先重新取得登录授权。再次运行跨目录试验前应清空本次合成输出或使用新文件名，避免把既有文件当成本轮写入。

```sh
node discovery.mjs
node initialize-buildr.mjs --explicit-skills --agents-skills
node runtime-validation.mjs smoke
node runtime-validation.mjs skill --agents-skills
node runtime-validation.mjs cross-denied
node runtime-validation.mjs cross-prompt-allowed
node runtime-validation.mjs cross-allowed
node runtime-validation.mjs question
node runtime-validation.mjs interrupt
node runtime-validation.mjs resume
node summarize.mjs
```
