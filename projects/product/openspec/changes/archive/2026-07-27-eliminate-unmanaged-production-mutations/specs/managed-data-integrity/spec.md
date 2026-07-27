## MODIFIED Requirements

### Requirement: 生产 mutation 只能使用受审阅写入入口
Buildr MUST 通过产品验证防止新的生产命令绕过安全路径、atomic writer、transaction primitives 和可注入文件系统入口执行未审阅的直接删除、复制或写入。

#### Scenario: 验证发现直接危险写入
- **WHEN** package check 扫描到生产 mutation 路径新增未列入显式 allowlist 的直接 `rm`、递归 copy 或非原子 write
- **THEN** 产品验证 MUST 失败
- **AND** finding MUST 指向文件和操作类型

#### Scenario: 临时投射和诊断文件发生 mutation
- **WHEN** 生产 application 为隔离验证创建或清理临时投射，或者把大型诊断结果写入文件
- **THEN** 这些 mutation MUST 使用受审阅且可注入的文件系统入口
- **AND** 临时文件清理 MUST 只作用于当前流程创建的精确临时根目录
