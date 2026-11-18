## Context

Antigravity 执行器只接受 Google 个人账号原生执行而不提供网关推理接口，此前未实现 `generateTitle`，从而在触发并行自动起名时记录不可用，或被工作会话发出的英文 `session_info_update` 覆盖标题；网关通道 `generateModelTitle` 也因提示语只约束“中文最多24字”未强约束“简体中文输出与主体包含中文”。

## Goals / Non-Goals

**Goals:**

- 为 Antigravity 提供独立、无工具、账号隔离的 `agy acp` 中文智能标题生成能力，避免 `orchestrator` 等重型模型进入规划或工具流程。
- 确保各模型网关通道与 Antigravity 搭配 Google 个人账号时的标题生成请求均明确生成简体中文精短标题。
- 阻止英文原生 `session_info_update` 抢占在途独立标题或覆盖中文兜底标题。

**Non-Goals:**

- 不绕过 Google 个人账号官方登录边界，不将 Antigravity 登录凭据用于其他执行器。
- 不修改对话历史消息本身的正文内容或语言。

## Decisions

### 1. Antigravity 隔离辅助进程通道（`executors/antigravity/title.ts`）

- 复用 `AntigravityCoordinator` 的认证状态与可执行文件摘要核验，单独通过 `openAuxiliaryTitleClient` 在 `nativeHome.temporary` 下的空目录开启 `agy acp`（不带 `--dangerously-skip-permissions`、`mcpServers: []`）。
- 若主会话使用 `orchestrator` 模型，标题会话自动挑选当前账号可用的轻量模型（如 `gemini-3.8-flash` / `*-low`）并优先设置最低思考深度，兼顾响应速度与配额消耗。
- 任何工具调用或权限/表单请求立即视为越权拒绝（`agent_title_tools_forbidden`），返回 JSON 解析结果必须包含汉字（`/[\p{Script=Han}]/u`），否则视为无效输出（`agent_title_output_invalid`）。结束时显式关闭会话、回收进程并清理临时目录与会话数据库产物。

### 2. 原生标题与独立中文标题协作优先级（`conversation-application.ts`）

- 独立中文标题正在生成或等待首轮结束补试时，忽略工作会话内原生 `title` 覆盖；对于 `antigravity` 推送的不含汉字的原生标题，直接拒绝接纳。

## Risks / Trade-offs

- [隔离启动 `agy acp` 会增加一次短时子进程握手] → 仅在首轮自动起名或用户显式请求时按需打开，使用 30 秒有界超时并在结束后立即回收进程与临时文件；选用轻量快速模型减小延迟。
- [英文技术主题对话可能含大量英文标识] → 要求标题主体包含简体中文（允许保留必要的产品专名与代码标识符），避免全部英文输出同时保留准确技术语义。
