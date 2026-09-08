## MODIFIED Requirements

### Requirement: Project Verification Application必须只校验和维护测试地图
Buildr MUST继续提供`project verification inspect|validate|update`。`src/modules/project-testing` MUST通过唯一模块入口只校验、读取和受控更新 Project `verification.yml` 测试地图，并 MUST通过具名 declaration capability 向 Task Verification 与 Diagnostics 提供只读事实。`inspect` MUST只读当前文件与identity；`validate` MUST检查closed schema、Project/Service scope、安全相对路径、命令和引用且零写入；`update` MUST使用expected identity防止覆盖外部变化。Application MUST不理解项目语义、不执行 Buildr 自身测试、不保存 Task Verification Report、不生成任务完成状态，也不得与 `test/verification` 或 `tools/testing|verification` 形成共享 writer。

#### Scenario: Agent更新已确认声明
- **WHEN** Agent按用户确认后的当前项目事实更新测试地图
- **THEN** Project Testing Application MUST校验closed v4 schema并通过唯一文件 writer 写入
- **AND** identity不匹配时MUST零写入返回冲突
- **AND** 运行测试、选择工程步骤、记录Task验证报告与完成Task MUST由各自责任主体执行

#### Scenario: Task Verification读取声明
- **WHEN** Task Verification 需要选择或解释项目测试入口
- **THEN** 它 MUST消费 Project Testing 的 declaration capability
- **AND** MUST不直接导入 Project Testing Persistence、解析器或文件 writer
