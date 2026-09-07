## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Invocation 必须引用既有且有界的验证操作
**Reason**: v3 invocation模型由v4完整入口与Agent guide取代。
**Migration**: 转换为testing family的`full`字段。

### Requirement: 环境、副作用和资源只按真实边界声明
**Reason**: 通用执行副作用和资源声明删除。
**Migration**: 只在`requirements`说明测试需要的资源。

### Requirement: Capability 声明指导必须核对真实测试边界
**Reason**: 由Agent形成测试地图候选的新Requirement取代。
**Migration**: 使用v4测试地图流程。

### Requirement: Declaration 必须只暴露稳定能力接口
**Reason**: v3 capability接口退出。
**Migration**: 使用v4 testing families。

### Requirement: Verification capability 必须显式声明准备依赖
**Reason**: Task Verification不再准备或执行capability。
**Migration**: 资源仅作为Agent可读requirements。

### Requirement: Capability准备引用不得形成测试DAG
**Reason**: preparation引用模型删除。
**Migration**: 无。

### Requirement: Project v3 必须声明稳定 Test Capability Families
**Reason**: v3被v4测试地图取代。
**Migration**: Agent形成v4候选并通过Project Verification update写入。

### Requirement: Capability invocation 必须区分 affected、full 与高级 provider
**Reason**: Task选择由Agent完成，不在声明中固化affected/provider执行模型。
**Migration**: 保留完整入口和可选selection提示。

### Requirement: Doctor 必须只读校验 v3 declaration
**Reason**: Doctor改为校验v4测试地图。
**Migration**: 使用v4 schema。

### Requirement: Command invocation 必须解析为声明式执行时限
**Reason**: 通用command runner和timeout模型删除。
**Migration**: 项目runner自行处理时限。

### Requirement: Verification Plan 必须规范化Workspace与Project相对changed path
**Reason**: Verification Plan删除。
**Migration**: Agent直接读取当前改动。

### Requirement: Formal Plan-only 必须提供只读Preparation preview
**Reason**: Plan-only和Preparation preview删除。
**Migration**: Agent按测试requirements判断环境。
