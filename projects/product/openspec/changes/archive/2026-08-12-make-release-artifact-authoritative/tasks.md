## 1. Release artifact identity

- [x] 1.1 实现 pack-once release artifact preparation，输出 tarball、pack metadata、SHA-256、SHA-512 integrity 与文件清单 manifest。
- [x] 1.2 扩展 registry state/readback，支持目标版本 integrity、dist-tag 与有界发布后确认。

## 2. Release artifact verification

- [x] 2.1 让 release smoke 支持显式本地 tarball/manifest 与官方 registry 精确版本两种 source，并复用同一安装后生命周期断言。
- [x] 2.2 增加 artifact identity、registry 冲突、重跑恢复和双模式 smoke 的 Unit/Contract/Integration 测试。

## 3. Publish workflow and recovery

- [x] 3.1 修改 `publish.yml` 为 pack-once、发布前 smoke、integrity gate、`npm publish <tarball>`、GitHub Release ensure 与发布后 registry smoke，删除完整 Candidate。
- [x] 3.2 实现并测试 GitHub Release ensure 语义：不存在时创建，存在时核对且不覆盖。
- [x] 3.3 上传 tarball、manifest 和失败 diagnostics，并确保 workflow 不包含 token 或第二次 pack/publish 路径。

## 4. Documentation and focused verification

- [x] 4.1 更新 release checklist 与 `buildr-release` Skill 源资产，说明唯一发布物、integrity readback 和部分成功恢复边界。
- [x] 4.2 完成 OpenSpec strict、发布专项、workflow contract、Quick 与 affected 验证，并核对没有 tag、npm 或 GitHub Release 外部写入。
