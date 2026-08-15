## 1. Release Awareness 核心

- [x] 1.1 实现 GA/RC 双轨道 semver 解析、独立比较、异常 tag notices 与统一 snapshot Application。
- [x] 1.2 在用户级 Buildr Data Root 实现每轨道最小 seen/notified/check 时间状态，并覆盖原子读写与重复通知测试。

## 2. CLI 与公开 JSON

- [x] 2.1 将 `update check` 改为一次查询 `dist-tags` 并输出双轨道人类文本与 `buildr.update-check/v2`。
- [x] 2.2 为 npm `update` 增加 `--track stable|candidate`、兼容默认选择、精确版本安装和禁止自动降级，并输出 `buildr.update/v2`。
- [x] 2.3 更新 CLI registry/help、JSON schema registry、system/contract/release-smoke fixtures 与 checkout/npm parity 覆盖。

## 3. Doctor 与 Buildr Web Runtime

- [x] 3.1 为 Doctor 增加独立非阻断 `releaseAwareness`/`notices` 投影，证明失败不改变 findings、repair plan、next steps、ok 或 readiness。
- [x] 3.2 增加全局只读 `/api/v1/release-awareness`，复用同一 Application 且不登记 npm 更新写路由。

## 4. Buildr Web 与 Agent 通知

- [x] 4.1 在 `buildr-web` 全局壳层增加 GA/RC 提示、复制精确命令与交给 Agent prompt，保持主导航和 Workspace 页面非阻断。
- [x] 4.2 构建正式 Web 产物到 `buildr` 的 `web-dist`，补齐前端/API/browser smoke 测试。
- [x] 4.3 更新产品入口 Buildr Skill，使完整检查和更新意图读取 v2 结果、说明 GA/RC 并在用户选择后执行对应轨道。

## 5. 发布双 tag 保证

- [x] 5.1 扩展 Registry release helper，发布前后同时读取 `latest`/`next`，校验目标版本类型与非目标 tag 不变。
- [x] 5.2 更新 publish workflow 和 open-source release contract tests，覆盖 RC、GA、历史错误 `latest` 与外部 tag 漂移。

## 6. 当前认知与直接验证

- [x] 6.1 评估并更新 Change Brief、Product glossary、Buildr/buildr-web Service current knowledge 和版本发布流程说明。
- [x] 6.2 运行受影响的 CLI、Doctor、HTTP、Web、Skill、release 与 OpenSpec strict 验证，修复反馈并确认 Change convergence/archive readiness。
