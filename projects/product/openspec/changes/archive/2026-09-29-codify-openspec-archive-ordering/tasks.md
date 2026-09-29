# Tasks: codify-openspec-archive-ordering

## 1. 注入文本

- [x] 1.1 修改 `services/buildr/resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md`：归档授权判定委托任务收尾交付语义；候选冻结序列写入变基主线、受影响验证重跑、预归档检查（preflight + 主规格漂移审查）与冲突分类
- [x] 1.2 修改 `services/buildr/resources/workspace/components/buildr/openspec/contributions/openspec-archive-converge.md`：归档在变基后的任务工作树上执行；preflight 结果只作开发信号，converge 自行重新观察当前输入

## 2. 构建产物

- [x] 2.1 重算并更新 `component.yml` 中两个 contribution 成员的 integrity hash

## 3. 验证

- [x] 3.1 `openspec validate codify-openspec-archive-ordering --strict` 通过
- [x] 3.2 `buildr openspec convergence preflight` 无阻塞（ready）
- [x] 3.3 component 完整性专项检查：用产品源码 `assetIntegrity` 算法重算两个 contribution 成员 hash，与 `component.yml` 登记值逐项比对一致（本变更无代码改动，无现有测试套件覆盖该面；渲染结果由收尾自举 sync 实际校验）
