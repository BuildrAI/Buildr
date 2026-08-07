# Task Verification 执行契约收敛

## 一句话摘要

让正式 `verification run` 与已声明的 Browser changed capability 使用同一套可执行输入契约，并把 CLI 参数误用与 target drift 变成可定位的 transient evidence。

## 背景与问题

`verification run`、`task verification inspect` 与 `task verification record` 是不同 authority，但 `--declaration-root` 边界不够显眼，容易在 execution 命令中误传。`product.browser-smoke` 通过 `test:browser:changed` 运行时依赖 `BUILDR_CHANGED_PATHS_JSON`，而 Project declaration 和通用 runner 没有闭合该动态输入，正式 Verification 因而可能在 Browser 启动前失败。现有 target stability 只给出 fingerprint 结果，无法直接区分 capability failure 与执行期间内容漂移。

## 目标与非目标

目标是闭合三种 Verification action 的 CLI/Skill 契约，让 Browser dispatcher 支持显式 changed paths 与 Git fallback，并输出安全、可定位的 target drift 诊断。非目标是改变 Browser 业务覆盖、Task Verification current Result schema、Task Development/Candidate/Finish authority，或引入多 worker 调度。

## 受影响用户或角色

- 运行正式 Task Verification 的 Agent。
- 维护 Project `verification.yml` 与 Browser changed selector 的 Buildr 开发者。
- 消费 transient execution evidence 和 current Verification Result 的 Task Development。

## 核心流程

`verification run` 只执行显式 capability；Browser changed dispatcher 优先读取显式 changed paths，缺失时从 execution root 的 Git verification base 推导；runner 在执行前后比较 target fingerprint，并在漂移时返回相对路径摘要。Agent 仍需在事实完整后通过 `task verification record` 写入 current Result。

## 关键变化

- `run`、`inspect`、`record` 的参数职责和错误提示明确化。
- `product.browser-smoke` 不再要求 Agent 手工补齐环境变量才能被正式 runner 调用。
- target drift 与 Browser assertion failure 分离诊断。
- 增加 CLI、dispatcher、Project declaration 和 system contract evidence。

## 影响、风险与兼容性

只影响 transient Verification execution 入口和 Product verification test assets，不迁移 current Result、不新增 structured store。显式 `BUILDR_CHANGED_PATHS_JSON` 继续兼容；Git base 无法解析时保持 fail-closed。主要风险是 fallback 误算路径或 drift 摘要泄露本机路径，由统一 collector、相对路径输出和隔离测试控制。

## 验收摘要

正式 `verification run` 不再因缺少 Browser changed input 在启动前失败；显式输入和 Git fallback 产生一致 selector plan；误传 `--declaration-root` 不启动 capability；target 漂移可区分并可定位；Browser 业务测试通过且没有引入通用 runner 的 Product-specific 依赖。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [task-verification delta](specs/task-verification/spec.md)
- [product-verification-quality delta](specs/product-verification-quality/spec.md)
- [tasks.md](tasks.md)
