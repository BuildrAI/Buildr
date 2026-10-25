## MODIFIED Requirements

### Requirement: Project必须使用v4测试地图声明稳定测试体系
Project根`verification.yml` MUST使用`buildr.project-verification/v4`，按少量testing families声明`id`、title、Project/Service scope、purpose、source paths、test roots、完整command或Agent guide、可选选择提示和requirements，并 MAY通过可选`location`明确路径根。声明MUST NOT逐项登记测试文件、Task选择、Candidate、Plan、Execution Record、DAG或测试结果。完整入口 MUST覆盖该族声明的真实测试范围；智能体 MUST核对实际工具，不以入口名称或存在文件代替覆盖判断。

#### Scenario: 前后端项目声明测试体系
- **WHEN** Project已有后端单元/功能测试、前端单元/组件/Browser测试和检查准备要求
- **THEN** Agent MUST将其归纳为少量稳定testing families
- **AND** 具体测试类、文件和本次任务选择MUST不进入声明

#### Scenario: 完整入口不覆盖声明测试根
- **WHEN** 一个测试族声明集成和端到端测试（E2E），而实际完整入口只执行集成测试
- **THEN** Agent MUST使测试族范围与真实完整入口一致，可拆成消费各自已有入口的测试族
- **AND** MUST不把未执行的端到端测试（E2E）报告为完整通过

### Requirement: Agent必须根据项目真实事实形成测试地图候选
测试建设技能（project-testing） MUST指导Agent读取Project/Service登记、`AGENTS.md`、构建文件、测试目录、npm/Maven脚本、Playwright配置、CI、资源依赖和检查准备要求，再形成候选。Application MUST NOT扫描项目后自动推断测试类型。

#### Scenario: 首次生成测试地图
- **WHEN** Project尚无v4声明
- **THEN** Agent MUST根据当前代码、脚本和文档形成候选并说明新增测试体系
- **AND** 超出现有授权的外部副作用或业务取舍 MUST说明具体影响交给用户决定；已确认事实的登记维护 MUST在授权内继续
