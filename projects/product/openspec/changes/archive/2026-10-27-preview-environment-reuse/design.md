# 设计：预览沿用开发版环境

动机与行为契约见 [proposal.md](proposal.md) 与 [specs/preview-environment-reuse/spec.md](specs/preview-environment-reuse/spec.md)。

## Context

- 预览当前把 `BUILDR_APP_DATA_DIR` 指向 `<productDataRoot>/previews/<instance>`，与开发版应用数据根（macOS 为 `~/Library/Application Support/Buildr Dev`）完全分离。
- 沿用对象分散在 `<dataRoot>/agent-service`：`model-access`（账号、缓存模型、启用偏好）、`connections/<provider>`（登录配置与模型运行缓存）、`programs/<provider>`（本应用安装的原生程序）、`conversations.sqlite`（会话与连接行）、`attachments`、`handoff-materials`。
- 连接行保存在 `conversations.sqlite` 的 `connections` 表，连接体含可执行文件、配置目录的绝对路径和 `dev/ino` 绑定指纹；原生程序通过 `nativeBinding` 以程序、版本、配置身份计算绑定。
- 已有预览播种包括工作空间登记与 `--task` 的任务库副本，本次不迁移它们，只新增应用数据侧的沿用模块。
- Codex 与 DSH 的可执行文件位于系统应用目录，可只读共用；Qoder 可执行文件位于开发版 `programs`，必须复制到预览并在绑定中重定位。

## Goals / Non-Goals

**Goals**

- 用一个 facet 注册表承接“从来源环境取得哪类事实、放到预览哪里、如何刷新与清理”。
- 首版支持 `model-catalog` 与 `agent-runtime` 两个 facet，显式参数触发。
- 所有持久写入在预览实例根内，来源只读，预览会话与开发版会话双向隔离。
- 支持 `--refresh-reuse` 的原子刷新与 `preview stop --purge` 的实例根彻底删除。

**Non-Goals**

- 不共享实时数据根，不进行跨实例实时同步。
- 不迁移工作空间登记与任务库播种。
- 不复制开发版会话、附件、交接材料。
- 不实现团队实例账号或发布物相关沿用语义。

## Decisions

### 沿用模块与 facet 契约

在 `services/buildr/src/web/application` 下新增独立的 preview reuse 模块，按 facet 注册：

```ts
type ReuseFacet = {
  id: string;                         // model-catalog | agent-runtime
  label: string;
  sensitivity: 'metadata' | 'credentials';
  defaultFor: boolean;                // profile 未显式列 facet 时的默认集合
  apply(input: {sourceRoot: string; previewRoot: string; workspaceRoots: string[]; refresh: boolean}): Promise<FacetResult>;
};
```

每个 facet 自己声明归属路径与排除项，并返回来源身份、播种/刷新、复制文件与字节数、诊断。注册表负责参数校验、执行顺序、错误隔离与结果汇总；不建立通用文件复制 DSL，避免任意路径复制。

**替代方案**：把所有环境事实做成一个大复制函数。无法表达“会话不复制”“程序只复制必需部分”“刷新只覆盖 facet 归属路径”等差异，已拒绝。

### 来源解析

`development` 解析为平台对应的开发版应用数据根，使用与开发版实例相同的 `defaultWebDataRoot('development')` 语义，而不是预览自身的 product data root。来源解析发生在预览写入前；来源缺失或不可读时在启动前失败。后续扩展 `released` 时复用同一解析入口。

### model-catalog facet

复制 `<sourceRoot>/agent-service/model-access` 到 `<previewRoot>/agent-service/model-access`。该目录约数百 KB，包含账号、缓存模型、启用偏好与凭证元数据。复制使用临时目录写入、校验后原子替换；已存在且未请求刷新时复用。

该 facet 只保证目录可见；provider 运行时不可用时，账号检查会保留上次目录，但真实调用不承诺。

### agent-runtime facet

包含 `model-catalog` 的结果，并按以下顺序准备：

1. 复制 `model-access`。
2. 复制各连接的登录配置：`<sourceRoot>/agent-service/connections/<provider>`，排除 `model-bindings` 与 `tmp`（模型运行缓存和临时目录，可由预览重新生成）。
3. 复制被连接引用且位于来源数据根内的原生程序（当前为 Qoder 的 `programs`）；系统应用目录中的可执行文件只保留引用，不复制。
4. 只从来源 `conversations.sqlite` 读取 `connections` 表，不复制 `conversations` 表、附件或交接材料。
5. 将连接体中的来源数据根前缀重定位为预览实例根，并重新计算原生绑定身份；写入预览交互库。

第 4、5 步由 `buildr-agent` 提供唯一的重定位入口，负责读取/写入连接记录、路径重写、绑定重算与安全校验；预览模块不直接改连接体或绑定格式。绑定重算失败时该连接标为失败并作为 facet 诊断返回，不写入指向来源路径的降级记录。

**替代方案**：直接复制开发版 `conversations.sqlite` 或连接行。会带入会话或失效的绝对路径与指纹，已拒绝。

### 播种、复用与刷新

每个 facet 在预览根维护自己的归属路径。首次启动且归属路径缺失时播种；已存在时默认复用。`--refresh-reuse` 只对显式声明的 facet 重新复制：写入同级临时目录，校验后替换归属路径，失败保留旧副本。facet 归属路径之外的预览状态不参与刷新。

### 可观察事实与安全

预览 owner/instance 记录新增可选 `reuse` 字段：来源标识、facet、播种/刷新时间、逐 facet 结果。启动 JSON 与 `preview list` 返回同一事实。错误只包含阶段、provider 与原因摘要，不包含凭证内容、令牌或来源敏感路径细节。复制文件以 owner-only 权限写入；来源目录只读，不创建符号链接。

### 清理

`preview stop` 保持既有语义，仅停止并清理 owner。`--purge` 在停止确认与 owner 匹配后删除 `<productDataRoot>/previews/<instance>` 整个目录；删除前校验目标仍在预览根内、非符号链接、实例记录属于当前 owner。默认不清理，避免误删仍要检查的现场。

### 失败影响

facet 失败不阻止预览启动：成功 facet 生效，失败 facet 返回诊断，预览继续以未沿用或部分沿用的状态运行。临时目录在失败时删除，已存在副本保留；其他预览与默认实例不受影响。

## Risks / Trade-offs

- [凭证副本]：沿用的登录配置与账号元数据会复制到预览根。→ 仅同 OS 用户可读、owner-only 权限、退出时 `--purge` 删除、日志不输出凭证。
- [复制体积]：排除 `model-bindings` 与临时缓存后仍可能达到数百 MB（Qoder 程序约 240 MB）。→ 首版只支持显式启用；后续可评估写时复制或按需复制。
- [provider 版本或配置漂移]：开发版更新原生程序后，旧副本绑定可能失效。→ 绑定失败按 facet 诊断返回；`--refresh-reuse` 重新复制并重建绑定。
- [来源并发写入]：复制期间开发版可能更新账号或 SQLite。→ 单表读取在 SQLite 事务内完成；文件按目录快照复制并在校验后替换，失败不使用部分副本。
- [会话隔离]：连接行与会话共用交互库。→ 重定位入口只读写 `connections` 表，测试必须断言会话、附件与交接材料未复制。
- [清理安全]：purge 删除实例根。→ 校验 owner、停止确认、路径归属与符号链接；默认 stop 不删除。

## Migration Plan

- 旧预览实例与 owner 记录不含 `reuse`，读取时按空值兼容，不需迁移。
- 新参数默认关闭，旧调用方行为不变。
- 已存在的预览数据目录保留；需要彻底清理时由 owner 使用 `--purge`，不在升级时批量删除。
- 发现沿用失败时保持预览可用，修复来源或刷新后重试，不影响已交付成果。

## Open Questions

- provider 登录配置的最小完整复制集是否因版本变化而扩大，需要在实现时用真实 provider 配置验证；如果 `model-bindings` 之外的目录仍有必需认证文件，将其纳入 facet 的显式复制清单并记录排除原因。
- 是否需要在后续版本提供 `released` 来源和 UI 入口；当前只要求 CLI 显式参数。
