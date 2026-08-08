## 1. Runtime 组合边界

- [x] 1.1 移除产品入口对完整 workspace capability routing evidence 的解析、注入和静态文案依赖
- [x] 1.2 将 consumer capability binding block 收敛为只包含自身依赖的紧凑可执行视图，并保留 blocked safety stop

## 2. 控制状态证据

- [x] 2.1 在 v2 Skill projection receipt 中增加向后兼容的 consumer-local capability binding 快照与完整性校验
- [x] 2.2 验证 Doctor full 保留完整 capability graph/contract digest，receipt 保持 canonical `.buildr` 路径并被 Git ignore

## 3. 产品说明

- [x] 3.1 更新产品入口 Buildr Skill 的按需路由与 Doctor full 使用说明
- [x] 3.2 在 `docs/architecture/` 编写 Buildr 技能体系架构文档，并补充产品文档导航
- [x] 3.3 创建 Change Brief，并收敛受影响的 technical architecture 与 Buildr Service current knowledge

## 4. 验证与收敛

- [x] 4.1 增补 consumer-local render、无全局 routing dump、receipt 证据和全部 supported adapters 一致性的自动化测试
- [x] 4.2 运行 changed/focused 反馈验证与严格 OpenSpec 校验，修复发现的问题
