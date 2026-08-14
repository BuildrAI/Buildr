# Development Onboarding 与 npm CLI 隔离对齐

## 摘要

让 clean-checkout development onboarding 只使用 checkout 内显式 Project bridge，并在 macOS/Windows证明不会改变 npm-owned PATH默认 CLI。

## 背景与问题

Buildr 当前产品模型已规定 PATH默认`buildr`只属于npm installation，development checkout通过`projects/product/buildr`工作。但repository onboarding的旧canonical场景和verifier仍安装POSIX development wrapper，导致规范冲突，并使Windows dev feedback在长时间全仓库准备后以`ENOENT`失败。

## 目标与非目标

目标是修正onboarding primary owner、删除legacy PATH installer、缩短Windows准备路径并以真实timing校准非阻断预算。非目标是改变npm installation、npm-owned Launcher、完整Candidate分片、正式发布或retained Finish恢复。

## 受影响用户或角色

- Buildr维护者：更早获得Windows changed feedback，且不再混淆npm默认CLI与development entry。
- CI与Release维护流程：继续以同一owner证明clean checkout，但失败点与timing更清晰。
- 普通npm用户：无行为变化。

## 核心流程

Verifier从当前Content Target形成Git candidate snapshot，使用当前Host Node旁的npm准备依赖，通过显式`projects/product/buildr`执行sync、Development Launcher、Doctor与update source检查，并在结束时核对`buildr`/`buildr.cmd`sentinel未变。

## 关键变化

- canonical requirement从“安装本地development CLI”改为“显式Project bridge且PATH零mutation”。
- clean-checkout fixture复用Git objects并只提交真实delta，替代全仓库复制与重新索引。
- 删除legacy installer/uninstaller及其重复POSIX lifecycle test。
- 预算在测试本体优化后依据多轮本地与hosted Windows成功timing决定。

## 影响、风险与兼容性

Windows验证依赖Git for Windows提供`sh`执行canonical bridge；缺失时明确失败而不回退内部CLI。`--shared`clone只在同一临时生命周期使用，源repository不会被临时origin或sync修改。npm用户行为与发布物完全兼容。

## 验收摘要

- OpenSpec strict与registry/owner契约通过。
- clean-checkout focus在本地多轮通过，且PATH sentinel保持不变。
- archive后形成的最终source SHA由Formal Task Verification只执行一次hosted Windows changed feedback，不再触发POSIX installer错误。
- timing evidence足以解释预算保留或调整，必要场景未被删除。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
