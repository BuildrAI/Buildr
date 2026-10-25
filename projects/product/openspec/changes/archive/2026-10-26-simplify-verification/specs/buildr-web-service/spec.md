## MODIFIED Requirements

### Requirement: 前后端与项目级测试必须按证明对象维护
Buildr Web Service MUST拥有前端渲染、交互、状态、client 与纯逻辑测试；Buildr Service MUST拥有后端业务、数据、协议、会话、进程、安装及公共宿主测试；真实前后端组合的完整流程 MUST作为 Product 端到端测试由项目验证入口维护。物理测试目录 MAY由最终工程结构决定，但每个测试的断言 owner MUST唯一。

#### Scenario: 运行前端与 Browser 验证
- **WHEN** 本次迁移运行前端 test/build 与生产托管 浏览器端到端检查（E2E）
- **THEN** 前端单元断言 MUST从 buildr-web Service 运行
- **AND** 跨服务 浏览器端到端检查（E2E） MUST使用 buildr 正式托管的 `web-dist`
- **AND** 同一行为 MUST不因文件名含 `web` 被机械复制为两套测试
