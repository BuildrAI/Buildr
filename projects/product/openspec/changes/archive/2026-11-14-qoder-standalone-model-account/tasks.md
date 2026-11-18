## 1. 独立订阅账号提供者与登录流程

- [x] 1.1 在 Qoder 产品定义中导出 `qoderModelAccountId = 'native-qoder'`，并将登录器与独立模型提供者参数化支持 `qoder` 与 `qoder-cn`，确保缺失本地 `qodercli` 时可按需通过 `programManager` 准备程序且不启用 `qoder` 智能体连接；验证模型登录与程序准备集成测试通过
- [x] 1.2 在模型提供者注册入口将 `native-qoder` 改为注册独立 `createQoderAccountModelProvider`，移除对 `connections.read('qoder')` 的绑定依赖；验证 TypeScript 编译通过且持久化迁移测试将旧 `connectionId: 'qoder'` 自动转为独立账号

## 2. Qoder 执行器策略与存量会话兼容

- [x] 2.1 更新 `qoder` 执行器描述与特性声明，统一采用 `defaultSourceAccountId: 'native-qoder'`、`accountConfigScope: 'model-account'`、`readySourceSupersedesConnection: true`、`upgradeVerification: 'account-probe'` 并移除 `observeViaModelAccount`；验证执行器策略单测与升级探针测试通过
- [x] 2.2 更新对话准备、原生内容根解析、Qoder 原生工具读取与持久化历史恢复，识别升级前指向旧连接配置目录的会话参与者并平滑开启新会话（同时保留旧工具详情可读）；验证存量会话续聊与跨智能体消费集成测试通过

## 3. 接口说明、文档与全量验证

- [x] 3.1 更新 `programmatic-help` 说明与 `agent-integration.md` 架构文档，使其准确反映 Qoder 国际版与 Qoder CN 一致采用独立订阅账号的事实，并同步更新单元测试、集成测试与前端账号视图单测
- [x] 3.2 在隔离工作树运行 `test:static`、单元测试套件、Qoder 相关集成测试、`verify-impact.mjs` 与 `openspec validate qoder-standalone-model-account --strict`，确认全部通过
