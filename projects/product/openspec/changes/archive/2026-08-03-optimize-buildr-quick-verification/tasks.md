## 1. Registry 分类与边界

- [x] 1.1 完成现有 registry step 的 Project Testing 审查，确定 owner、意图、执行边界、编排场景、证明范围和目标耗时
- [x] 1.2 在唯一 verification registry 中加入最小 `testing` 分类，并让 validation 对缺失或非法分类 fail closed
- [x] 1.3 为 registry 分类、Quick 资格和 Candidate 完整性补充 contract tests

## 2. Unit、Component 与 Integration

- [x] 2.1 将纯逻辑测试保留在 Unit，并把直接穿过文件系统、Git 或进程边界的历史 Unit 测试迁入 Integration
- [x] 2.2 建立 `test:component`，迁入使用 fake 协作者的同进程有界组装测试
- [x] 2.3 增加 Unit/Component 边界回归，防止真实进程、网络或文件系统依赖重新混入

## 3. Quick 编排

- [x] 3.1 让 `npm test` / `test:fast` 运行 Unit、Component 与低成本 Static step，不再默认执行重型 `integration-fast`
- [x] 3.2 保持迁移后的 Integration 由 changed/focus 按 owner 选择，并由 Candidate 完整执行
- [x] 3.3 更新 `product.fast` capability 的证明范围，不改变 verification schema 或 Result authority

## 4. 文档、认知与验证

- [x] 4.1 更新验证入口说明和 Buildr 测试实践文档，记录分类表、前后基线、取舍和剩余问题
- [x] 4.2 收敛 Brief、current knowledge impact 与术语核对结果
- [x] 4.3 运行 Unit、Component、Integration、Fast、Changed 和 registry 定向验证，读取 timing summary 并修复失败
- [x] 4.4 完成 OpenSpec strict 与主动审查，形成最终 Task Verification / Task Finish 就绪候选
