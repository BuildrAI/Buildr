## Context

第一版实现把确定性 self-bootstrap closeout runner 放在 `services/buildr/src/`，由 Workspace Skill 调用产品内部 driver。虽然没有公共 CLI 或普通 Workspace routing，但 `package.json` 发布整个 `src/`，因此 npm 消费者仍会收到一份只对 Buildr 自举 Workspace 有意义的实现。

Buildr 的既有资产模型允许 Skill 携带 `scripts/`，并由 runtime render 原样投射完整目录。`buildr-self-bootstrap-sync` 又只属于当前自举 Workspace 的 `buildr-self-bootstrap` Component，因此它是 runner 的自然 ownership 边界。

## Goals / Non-Goals

**Goals:**

- Runner 源码、命令入口和恢复逻辑只由自举 Skill 携带。
- 保持一次 Agent 调用、结构化阶段结果、幂等恢复和 Git/Finish 权威边界。
- 证明 npm package 不包含 self-bootstrap runner，普通 Workspace 不获得该 Skill。
- Product 继续提供通用 `resolvedContext` 和只读 `task finish inspect`。

**Non-Goals:**

- 不改变 Formal Finish 五阶段、Result schema 或普通 Workspace 行为。
- 不增加公共 CLI、Component executable member、hook、runner store 或持久 execution capsule。
- 不改变 sync、commit、push、安装、Doctor 和 same-run resume 的授权边界。

## Decisions

### Runner 作为 Skill bundled script

将实现收敛为 `skills/buildr-self-bootstrap-sync/scripts/closeout.mjs`。脚本既导出可测试的 plan/runner 函数，又在作为主程序启动时解析参数并输出 `buildr.self-bootstrap-closeout-result/v1`。

选择 Skill bundled script 而不是 Product internal module，是因为该逻辑只服务自举 Component；Skill 目录本来就是可复用专业动作及其确定性脚本的 authority。Component 仍只拥有 Skill source，不注册 executable member 或 runtime hook。

### 通过 Product CLI 读取 Finish Result

脚本使用 retained Workspace 的 `projects/product/buildr task finish inspect --run ... --detail full --json` 只读取得同一 run Result，再消费产品生成的 `resolvedContext`。它不导入 `src/application`，从而避免把自举 runner 重新绑定到 npm package 内部模块路径。

CLI 调用只是 runner 内部的确定性子进程，不增加 Agent 工具调用，也不取得 Finish writer authority。Doctor-blocked finalize 仍使用同一 Product CLI 的 matching resume token恢复原 run。

### 测试保留在 Product verification 中

Product integration test 从 repository root 的 Skill script导入导出函数，继续覆盖 fresh、push failure/resume、already-complete、identity drift、安装失败和same-run resume。契约测试检查脚本存在于 Skill、Product `src/` 不再存在 runner，以及 package dry-run不包含匹配文件。

### 发布与投射边界

Runner 不加入 `services/buildr/package/manifest.yml`，不进入 `package/targets/**`，也不提供产品 CLI command。自举 Component 的 Skill directory integrity覆盖 `SKILL.md`和`scripts/closeout.mjs`；Workspace runtime投射完整脚本字节，并由Environment绑定Node显式启动，不依赖脚本自身可执行位。

## Risks / Trade-offs

- [Skill script依赖retained Product CLI可用] → preflight核对CLI、run schema、`resolvedContext` capability和Environment绑定Node；失败时在任何Git副作用前blocked。
- [跨根测试可能被误认为产品运行时依赖] → 只有test代码读取Workspace Skill；Product production `src/`和package manifest不引用该路径，并用静态契约锁定。
- [Component integrity会因新增脚本变化] → 以完整Skill目录重新计算integrity并执行sync/Doctor验证。
- [现有Candidate与handoff失效] → 新Change完成、收敛和归档后重新观察Content Target、正式验证、Completion Review和handoff。

## Migration Plan

1. 新增Skill脚本并把现有runner/driver逻辑合并迁入。
2. 更新Skill/Component说明、integrity和测试，然后删除Product内部runner/driver。
3. 更新current knowledge，执行OpenSpec deterministic converge/archive。
4. 重新执行Task Development候选流程；不在本Change中提交、推送或执行Formal Finish。

回滚时可在未交付前恢复Product内部文件与旧Skill入口；不得同时保留两套可调用runner，以免产生双入口。

## Open Questions

无。
