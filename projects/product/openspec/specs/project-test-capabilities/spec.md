# project-test-capabilities Specification

## Purpose
定义 Project 可选测试能力声明的模型、成熟度、执行阶段、门禁强度、授权边界与验证证据要求，使团队能逐步发现、试运行并确认稳定门禁，同时保持未声明项目的零配置兼容。
## Requirements

### Requirement: Project必须使用v4测试地图声明稳定测试体系
Project根`verification.yml` MUST使用`buildr.project-verification/v4`，按少量testing families声明`id`、title、Project/Service scope、purpose、source paths、test roots、完整command或Agent guide、可选选择提示和requirements。声明MUST NOT逐项登记测试文件、Task选择、Candidate、Plan、Execution Record、DAG或测试结果。

#### Scenario: 前后端项目声明测试体系
- **WHEN** Project已有后端单元/功能测试、前端单元/组件/Browser测试和环境冒烟说明
- **THEN** Agent MUST将其归纳为少量稳定testing families
- **AND** 具体测试类、文件和本次任务选择MUST不进入声明

### Requirement: Agent必须根据项目真实事实形成测试地图候选
Task Verification Skill MUST指导Agent读取Project/Service登记、`AGENTS.md`、构建文件、测试目录、npm/Maven脚本、Playwright配置、CI、资源依赖和环境冒烟说明，再形成候选。Application MUST NOT扫描项目后自动推断测试类型。

#### Scenario: 首次生成测试地图
- **WHEN** Project尚无v4声明
- **THEN** Agent MUST根据当前代码、脚本和文档形成候选并说明新增测试体系
- **AND** 新测试环境、外部系统或长期测试边界变化MUST交给用户确认

### Requirement: Project Verification Application必须只校验和维护测试地图
Buildr MUST提供`project verification inspect|validate|update`。`inspect`只读当前文件与identity；`validate`检查closed schema、Project/Service scope、安全相对路径、命令和引用且零写入；`update` MUST使用expected identity防止覆盖外部变化。Application MUST不理解项目语义、不生成Task验证计划或执行测试。

#### Scenario: Agent更新已确认声明
- **WHEN** Agent提交合法候选和matching expected identity
- **THEN** Application MUST原子更新`verification.yml`并返回新identity
- **AND** identity不匹配时MUST零写入返回冲突
