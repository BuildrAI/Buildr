## MODIFIED Requirements

### Requirement: Workspace CLI必须按独立领域调用Application
Workspace、Project与Service CLI Adapter MUST分别位于`src/workspace/interfaces/cli/`并只负责所属命令的参数解析、Application调用、CLI输出和语法错误。Interface MUST NOT直接解析或写入Workspace/Project/Service Manifest、执行Git clone/copy身份决策、决定Workspace mutation范围或复制Application业务校验。

#### Scenario: Project创建命令
- **WHEN**用户执行`buildr project create`
- **THEN**Project CLI Adapter MUST把参数映射为Project Command Application输入
- **AND**Project Application MUST通过Project Repository与现有Git/filesystem Infrastructure完成创建或附接
- **AND**CLI MUST不直接导入YAML、Project Domain writer或Manifest Repository实现

#### Scenario: Service创建命令
- **WHEN**用户执行`buildr service create`
- **THEN**Service CLI Adapter MUST把参数映射为Service Command Application输入
- **AND**Service Application MUST通过Service Repository与现有Git/filesystem Infrastructure完成创建、附接或复制
- **AND**公开命令、参数、输出、错误、Git副作用和next action MUST保持兼容

#### Scenario: 根据创建副作用边界拆分
- **WHEN**Project或Service创建用例具有独立Git/filesystem/staging/Manifest mutation与失败清理生命周期
- **THEN**对应领域 MUST由所属Application统一拥有创建职责；是否独立文件取决于重要隔离价值或实际体量，不得仅因存在独立逻辑单元就拆文件
- **AND**原Application在职责和体量仍可维护时 MUST不为Query/Command目录对称继续拆分
