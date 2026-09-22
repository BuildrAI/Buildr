## Why

`redesign-qoder-runtime-adapter` 让 `qoder` 同时投射 `.qoder/skills`（主根）与 `.agents/skills`（镜像根）。正式自举工作空间的实机激活暴露该前提不成立：

1. 镜像根对 Qoder 自身没有增加任何可见性。`.qoder/skills` 是 Qoder 官方文档承诺的项目级发现根，桌面 App、Qoder IDE 与 Qoder CLI 都读取它（本机直接证据：当前 Qoder 会话从 `~/Buildr/.qoder/skills/` 加载了 `archify` 与 `terminology-governance`）。桌面 App 只是**额外**读取 `.agents/skills`，而该目录在装了 `codex`/`cursor`/`trae` 的工作空间里本来就有内容，Qoder 已经看得见。
2. 镜像根与共享根的真实归属冲突。渲染出的 `SKILL.md` 正文含 adapter 相关的能力绑定（capability binding）provider 路径：`codex` 写在 `.agents/skills/task-finish/SKILL.md` 的 provider 路径是 `.agents/skills/task-manager/SKILL.md`，而 `qoder` 期望同一文件里是 `.qoder/skills/task-manager/SKILL.md`。两者字节不同，`reconcileRuntimePlan` 正确地拒绝覆盖他方受管文件，于是 `runtime check qoder` 稳定报出 `missing=30`（镜像回执从未写出）与 `stale=9`（他人文件被判为 qoder 过期），最终诊断 `runtime.qoder_stale` 阻塞自举激活。

即双根投射没有换来任何发现能力，只把 `qoder` 推到别的 adapter 已持有的共享根上争抢同一批路径。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`：`qoder` 的 workspace destination Skills root 收敛回单一 `.qoder`；`.agents/skills` 在 discovery metadata 中继续作为宿主开关控制的**共享发现根**披露，但明确不是 Buildr 为 `qoder` 写入的 root。共享 `.agents` 根内"其他 adapter 的回执即归属证明"的清理规则保留并归入该共享根场景。

安装形态（Runtime Installation Surface）探测、`cli` 一等 surface、以及"形态缺席不降低 readiness"三条承诺均保持不变，本变更不触碰。

## What Changes

- `qoder` descriptor 移除 `mirrorRoots: ['.agents']`，Skills trait 回到单 root `.qoder`；`runtime list --json` 的 `qoder` 条目不再列出 `.agents` 为可写 root，`runtimeTargets` 不再包含 `.agents/skills/` 与 `.agents/buildr/skill-install-plans/`。
- 移除当前无人使用的镜像机制本身：descriptor 的 `mirrorRoots` 字段与其校验、按根回执命名（`<skillId>--root-<slug>.json`）与回执内的 `runtimeRoot` 字段。workspace destination 的 `roots` 数组形态保留（它是 destination 的现有形状，所有 adapter 都走这条路径，且共享根归属规则依赖它）。
- 共享根归属规则保留在 `managedRuntimeSkillOrphans`：同一 `.agents` 根内已由其他 adapter 回执声明的同路径目标，既不被声明为 orphan，也不被报告为冲突。该规则服务的是 `codex`/`cursor`/`trae` 今天真实存在的共享根场景。
- 无 **BREAKING**：`.qoder/skills` 与 `~/.qoder/skills` 的既有投射、Rules、命令接口均不变。已写入过镜像根的工作空间（本次未在任何真实工作空间成功写入镜像）不需要迁移；回执命名回到 `<skillId>.json` 单根形态，与所有未声明镜像根的 adapter 完全一致。
