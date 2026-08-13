## 1. 发布权威契约

- [x] 1.1 在 release contract v2 增加唯一 `publishAuthority` 元组并补齐 contract 测试
- [x] 1.2 实现 authority tuple 与 npm Trusted Publisher current 记录的 closed 归一化/比较

## 2. Tag 前 Preflight 与 Convergence

- [x] 2.1 实现只读 release authority preflight，核对 package、Git、workflow、GitHub 与 npm current 事实并输出 v1 evidence
- [x] 2.2 让 post-main release convergence 强制校验 source commit/workflow digest/expected tuple 绑定的 ready evidence
- [x] 2.3 增加 ready、drift、unauthenticated、旧工具与 stale evidence 的 fixture/CLI 测试

## 3. Publish 失败诊断

- [x] 3.1 实现 trusted publish wrapper，保留 npm stdio/退出码并对 authority 相关失败追加 expected tuple 与恢复路径
- [x] 3.2 将 GitHub workflow 切换到 wrapper，并更新 workflow contract 测试

## 4. 发布流程与当前认知

- [x] 4.1 更新 buildr-release Skill 与 release checklist，固定 authenticated preflight → post-main convergence → tag 授权顺序
- [x] 4.2 收敛 release flow、technical architecture、Brief 与 knowledge impact evidence

## 5. 验证

- [x] 5.1 运行 release 聚焦测试、OpenSpec strict validation 与受影响 verification capability
- [x] 5.2 形成匹配 Content Target 的 Formal Verification，并完成归档前 OpenSpec 与 current knowledge 收敛检查
