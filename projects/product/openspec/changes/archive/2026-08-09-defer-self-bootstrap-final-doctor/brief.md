# Task Finish 自举 Doctor 判定优化

## 摘要

普通Workspace继续把指定Agent Doctor失败视为Formal Finish阻塞；Buildr自举Workspace通过已安装的append，只在交付已完成且唯一失败为retained Doctor时先执行Self-bootstrap动作，再恢复同一个Finish run，由Sync后的指定Agent Doctor形成最终结论。

## 背景与问题

当前Finish使用inventory Doctor，无法严格验收当前Agent runtime；同时自举append只有Formal Finish complete后才运行，若新版Component尚未sync就使Doctor不ready，append永远没有机会修复。单纯增加“跳过Doctor”参数会让普通Workspace也能绕过门禁，并扩大为通用hook。

## 目标

- 普通Workspace使用指定Agent Doctor，失败保持blocked且不cleanup。
- Doctor blocked Result保存已经完成的交付和matching resume事实。
- 自举append仅对严格匹配的Doctor blocked run执行封闭Self-bootstrap plan并恢复同一run。
- 最终Doctor未通过时不形成Formal Finish complete。
- 不新增Result、workflow store、hook、scheduler或用户Workspace自举依赖。

## 非目标

- 不改变Doctor finding分类和Component版本authority。
- 不让通用Product executor执行package sync、development CLI或Local App安装。
- 不从HEAD、dirty tree、当前diff或时间推断自举范围。
- 不修改Candidate、Formal Verification、Review、decision或Development handoff。

## 核心流程

普通Workspace：`deliver → doctor --agent → passed后cleanup；failed则blocked`。

自举Workspace首轮Doctor blocked：`partial delivery + resume → append识别 → Self-bootstrap Sync/安装 → 同一run resume → doctor --agent → cleanup`。

自举Workspace首轮已经complete：继续执行既有post-Finish activation与最终指定Agent Doctor。

## 影响、风险与兼容性

Finish JSON继续使用v2；旧blocked run没有完整partial delivery时保持旧恢复方式，不迁移、不推断。自举Sync可能在Formal Finish完成前生成carrier的后继commit，因此resume必须复用现有`already-contained`逐路径证明。普通用户Workspace没有安装自举Component，行为只有“Doctor改为指定Agent且失败严格阻塞”的变化。

## 验收摘要

- 普通Workspace Doctor失败不cleanup且返回精确resume。
- 自举append只恢复retained Doctor blocked，不覆盖其他失败。
- Sync后同一run最终Doctor通过才完成cleanup。
- normal complete路径的post-Finish activation保持可用。
- package/runtime/public JSON与CLI行为一致，且没有新增长期authority。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/agent-task-workflows/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
