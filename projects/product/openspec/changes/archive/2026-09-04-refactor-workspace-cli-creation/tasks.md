## 1. Manifest与Application职责

- [x] 1.1 将Project/Service CLI中的Manifest兼容解析、序列化和写入迁回所属Repository并保持v1/v2行为
- [x] 1.2 将Project创建、附接、Git身份和Registry mutation迁入独立Project Creation Application，保持原Project Application不机械拆分
- [x] 1.3 将Service创建、附接/复制、Git身份和Registry mutation迁入独立Service Creation Application，保持原Service Application不机械拆分

## 2. CLI与模块组装

- [x] 2.1 建立Workspace、Project、Service三个独立CLI Adapter，删除旧729行聚合文件中的业务和持久化实现
- [x] 2.2 更新workspace/module.ts contribution注入和runtime port，保持公开command catalog、help、输出和错误兼容
- [x] 2.3 更新结构验证，拒绝CLI直接导入YAML、Domain writer、Manifest Repository或执行Project/Service业务mutation

## 3. 当前认知与验证

- [x] 3.1 更新Brief、Service架构文档和current knowledge，记录三个领域CLI与Application owner
- [x] 3.2 运行严格类型、CLI compatibility、Project/Service、Workspace生命周期、OpenSpec与完整受影响验证并修复回归
