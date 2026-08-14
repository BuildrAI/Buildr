## 1. 发布 harness 修复

- [x] 1.1 在 tag publish Host Node verifier step 中显式注入冻结 `release-artifact.json`
- [x] 1.2 扩展 workflow contract test，闭合断言 tarball、pack metadata、manifest 与 verifier 顺序
- [x] 1.3 运行发布契约 focused tests，确认缺失 manifest 的配置会失败且当前配置通过

## 2. rc.11 发布材料

- [x] 2.1 将 package 与 lockfile 无 tag 更新到 `0.1.0-rc.11`
- [x] 2.2 更新 CHANGELOG、双语 README、Service/package README 与 release checklist，准确记录 rc.10 失败事实和 rc.11 修复范围
- [x] 2.3 生成 rc.11 release notes 预览，并核对 npm 官方 registry URL 与 `next` 映射

## 3. 当前认知与验证反馈

- [x] 3.1 完成 Brief、knowledge impact 与受影响发布流程知识的 assess/reconcile
- [x] 3.2 运行 changed/affected 验证并读取最终 timing summary
- [x] 3.3 因 publish workflow 与 release verification contract 变化，运行本地完整 Candidate 并读取 timing summary
- [x] 3.4 运行 OpenSpec strict validation，确认 artifacts 与实现已具备确定性 convergence 条件
