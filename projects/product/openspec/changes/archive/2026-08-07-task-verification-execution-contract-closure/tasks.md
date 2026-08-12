## 1. 收敛 CLI 与 transient execution 契约

- [x] 1.1 为 `verification run` 的 unknown option 增加 `--declaration-root` 定向诊断，并同步 CLI help、Task Verification Skill 与 contract assertions，明确 `run`、`inspect`、`record` 的参数归属。
- [x] 1.2 为 `verification run` 增加 target observation 差异摘要：区分 capability failed、target drift 和输入诊断，保持 transient evidence 与 current Result 边界。
- [x] 1.3 增加 CLI/System 测试，证明误传 `--declaration-root` 不启动 capability、不写 Result，并证明 target drift 返回稳定、可定位的失败事实。

## 2. 闭合 Browser changed capability 输入

- [x] 2.1 抽取或复用 Product changed-path collector，使 Browser dispatcher 支持“显式 `BUILDR_CHANGED_PATHS_JSON` 优先、Git verification base fallback”两种输入路径。
- [x] 2.2 在 fallback 无法解析时返回稳定 input/base diagnostic，并保持 selector plan 的 affected/full、reason 和未映射路径 fail-closed 语义。
- [x] 2.3 增加 dispatcher/Project verification contract 测试，覆盖显式输入、Git fallback、无 base 失败和 `product.browser-smoke` 正式 capability invocation。

## 3. 声明、文档与回归验证

- [x] 3.1 更新 `projects/product/verification.yml`、CLI reference、Task Verification Skill 和相关 package source，使 capability 的实际执行输入与文档一致。
- [x] 3.2 运行 OpenSpec strict validation、静态/contract 测试和受影响的 Verification/System 测试，确认没有引入通用 runner 的 Product-specific 依赖或多 worker 编排。
- [x] 3.3 收敛 current knowledge、Planning Review、Task Verification、Candidate 与 Completion Review，记录正式 Verification 的接口契约、target drift 诊断和 Browser execution evidence。
