## ADDED Requirements

### Requirement: Browser changed selector 必须形成闭合适用性结果
Buildr Product Browser changed dispatcher MUST 对每次可解析的 changed paths 返回机器可判定的 `selected` 或 `not-applicable` 结果；命中 `product.browser-smoke` 声明适用范围的路径 MUST 选择至少一个稳定 selector，否则 MUST 在构建或启动 Chrome 前 fail closed。合法 `not-applicable` MUST NOT 被报告为 Browser 页面或业务交互已经通过。

#### Scenario: 页面源码选择受影响 selector
- **WHEN** changed paths 只包含一个已映射的 Buildr Web 页面或交互源码
- **THEN** dispatcher MUST 返回 `selected` 和对应页面 selector
- **AND** MUST NOT 强制执行无关页面 selector

#### Scenario: Web package 或构建配置变化
- **WHEN** changed paths 包含 Buildr Web `package.json`、lockfile、Vite/TypeScript 配置或共享构建入口
- **THEN** dispatcher MUST 返回 `selected` 与显式完整 selector
- **AND** MUST NOT 以 0 selector 成功退出

#### Scenario: changed paths 不属于 Browser capability
- **WHEN** changed paths 均不命中 Browser capability 的声明适用范围
- **THEN** dispatcher MUST 返回 `not-applicable` 并保留选择理由
- **AND** MUST NOT 构建 Buildr Web 或启动 Chrome

### Requirement: Browser verification 必须只读校验冻结的 web-dist
Buildr Product Browser verification MUST 在系统临时目录使用当前 Buildr Web source 与锁定依赖生成 staging dist，并 MUST 在启动生产托管 Browser smoke 前确认其相对文件集合、文件类型与 bytes 精确等于冻结目标中的 tracked `web-dist`。该验证 MUST NOT 删除、覆盖或新增冻结目标中的 `web-dist` 文件。

#### Scenario: staging dist 与 tracked web-dist 一致
- **WHEN** 当前 Buildr Web source 可重建出与 tracked `web-dist` 精确一致的 staging tree
- **THEN** Browser verification MUST 使用冻结目标中已确认的 production-hosted `web-dist` 运行受影响 selector
- **AND** 完成或失败后 MUST 清理测试拥有的 staging root

#### Scenario: Web source 与 tracked web-dist 漂移
- **WHEN** staging tree 存在新增、缺失、类型不同或 bytes 不同的文件
- **THEN** Browser verification MUST 在启动 Chrome 前失败并报告有界的 dist drift
- **AND** 冻结目标的 Git working tree MUST 保持执行前内容不变
