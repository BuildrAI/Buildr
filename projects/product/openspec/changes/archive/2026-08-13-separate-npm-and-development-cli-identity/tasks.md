## 1. Development CLI 隔离

- [x] 1.1 修改 `install:development`，只安装并验证 checkout-backed `Buildr Web Dev`，不调用 development CLI installer 或 PATH 命令
- [x] 1.2 保留 legacy CLI 安装/卸载工具的迁移边界，并增加 contract 测试确保 canonical 开发、自举和发布流程不再调用它们

## 2. Self-bootstrap 编排

- [x] 2.1 将 runner 的 CLI action/stage 改为 retained `projects/product/buildr` 显式入口验证，并注入 Environment retained Node
- [x] 2.2 让最终 Doctor 与 same-run resume 只通过已验证的 retained Project bridge 执行，删除 PATH/default-wrapper identity 依赖
- [x] 2.3 更新 self-bootstrap Skill、恢复计划、结构化 evidence 与 Component integrity

## 3. Workspace 与发布契约

- [x] 3.1 更新 root `AGENTS.md`，明确默认 PATH 属于 npm installation、自举只使用 `projects/product/buildr`
- [x] 3.2 更新 `buildr-release`，分别验证 retained checkout 与 npm 发布物身份，不再安装 development CLI

## 4. 当前知识与文档

- [x] 4.1 更新 Buildr Service、技术架构、OpenSpec lifecycle flow 和 glossary 中的 CLI 身份隔离事实
- [x] 4.2 更新产品维护文档中 self-bootstrap 与 development installation 的说明

## 5. 验证与收敛

- [x] 5.1 更新 development installer、self-bootstrap integration/contract 与 release contract 测试，覆盖零 PATH mutation、显式入口 identity 和失败恢复
- [x] 5.2 运行受影响测试、package 快速验证与 OpenSpec strict validation
- [x] 5.3 完成 current knowledge reconcile、勾选全部 Change tasks，并通过单一 `buildr openspec converge` 同步 canonical specs 与归档 Change
