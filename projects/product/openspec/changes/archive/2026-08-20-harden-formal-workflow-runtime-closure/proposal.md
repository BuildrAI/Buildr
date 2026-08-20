## Why

正式工作流的写入来源、内部入口和公共输出仍存在运行时闭环缺口：候选源码可借用安装包 payload identity 绕过 retained store 写入保护，npm artifact 又没有为 Retrospective 与 Planning Identity 提供自包含入口。与此同时，Verification JSON 会重复携带已归档的大体量输出，applicability 的 `unknown` 也缺少可操作解释；这些问题已经影响跨版本恢复、自动化稳定性和 Agent 判断成本，需要在当前 dev 上统一收敛。

## What Changes

- 将 retained canonical store 的 writer provenance 绑定到实际 controller/code source identity，资源 payload override 不再影响写入来源判定。
- 为 Task Development、Task Retrospective 与 Task Planning Identity 提供一致的 bundled `__internal` CLI 路由，并让受管 Skill/sidebars 只依赖 retained controller invocation。
- 增加 npm 安装产物的内部路由闭环测试及 Doctor 诊断，确保 Skill 声明的入口在实际 artifact 中存在并可启动。
- 将 Verification `--json` 收敛为摘要、identity、outcome 与失败摘要；完整 stdout/stderr 只保存在 Execution Record。
- 为 Task Verification applicability 的 `unknown` 返回稳定 reason，明确未读取或未提供的事实轴。
- 不迁移历史 Environment Receipt，也不把旧路径失效场景声称为已经定位的当前缺陷。
- 不包含破坏性公共接口变更；新增的 reason 与紧凑 JSON 是既有公共契约的兼容性收敛。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`: 强化 retained store writer provenance，禁止 payload identity 覆盖实际 controller 来源。
- `buildr-package-assets`: 要求 npm artifact 原子交付全部正式工作流内部路由，并由产物测试和 Doctor 校验。
- `agent-task-workflows`: 受管消费者通过 retained controller invocation 调用内部工作流，不再直连 checkout 内部 driver 文件。
- `public-json-contracts`: Verification 公共 JSON 不再内嵌完整 capability stdout/stderr，只返回可携带摘要和记录 identity。
- `task-verification`: applicability 为 `unknown` 时返回稳定且可解释的 reason。

## Impact

影响 Buildr npm package/CLI、SQLite workspace writer provenance、Doctor、Verification 与 Task Verification application、受管 Skills/sidebars、安装产物集成测试，以及对应 Buildr Product specs 与 current knowledge。外部业务仓库和历史 Environment 数据不在本次修改范围内。
