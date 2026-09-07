## MODIFIED Requirements

### Requirement: Product 顶层目录必须按生命周期分离
Buildr Product Service MUST 使用 `bin/`、`src/`、`resources/`、`test/`、`tools/` 和 `docs/` 分别承载可执行入口、产品源码、文件型交付资源、测试验证、checkout-only工具和文档。`web-dist/`与`package/targets/test-context/` MAY仅作为精确ignore、可删除并可重建的本地构建输出存在；`package/` MAY仅保留具备明确后续owner、理由和退出条件的deferred源码子树。Buildr/Buildr Web `src/**/generated/*-dto.ts` MUST由Schema在构建前生成且MUST NOT进入tracked tree。

#### Scenario: 检查完成迁移的 Product checkout
- **WHEN** architecture verifier扫描Product Service顶层和tracked files
- **THEN** `bin/`、`src/`、`resources/`、`test/`、`tools/`和`docs/` MUST各自只包含其声明生命周期内的tracked内容
- **AND** `web-dist/`、`package/targets/test-context/`和已登记DTO generated目录 MUST没有tracked文件并由精确ignore覆盖
- **AND** `package/`中的其他tracked文件 MUST只属于明确deferred allowlist
- **AND** tracked source、test、package metadata、docs和active OpenSpec artifacts MUST NOT把本地生成目录描述为源码authority

#### Scenario: 本地构建物化忽略输出
- **WHEN** 维护者从干净checkout运行声明的开发构建入口
- **THEN** builder MAY在上述ignored路径物化生成物供本地消费
- **AND** Git tracked/index状态 MUST不因构建输出改变
