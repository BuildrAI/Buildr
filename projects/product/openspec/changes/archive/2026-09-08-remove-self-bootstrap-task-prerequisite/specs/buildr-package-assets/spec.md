## MODIFIED Requirements

### Requirement: Buildr 自举 Component 必须统一执行自举激活
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST消费真实基线、真实Git交付、delivered ref、retained checkout、Product Node与当前变化范围，按需组合package sync、development Buildr Web安装、开发入口验证与最终Doctor；Task编号MAY作为可选说明，但MUST NOT要求Task存在或已完成。MUST不读取旧Finish run、Task Contribution、Environment Receipt或resume token，也不安装或验证PATH默认development CLI。

#### Scenario: 普通源码或文档变化
- **WHEN** 当前真实变化未命中规则、技能、组件、命令、package、CLI或Buildr Web实际影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不执行sync、Buildr Web安装或PATH CLI mutation

#### Scenario: 自举动作适用
- **WHEN** delivered ref由目标本地及远端分支持有且真实变化命中自举范围
- **THEN**唯一runner MUST执行适用动作并通过retained `projects/product/buildr`验证入口与最终Doctor
- **AND** 失败 MUST形成Activation Attention且不撤销Git交付或Task结果

#### Scenario: 无任务记录或任务尚未完成
- **WHEN** 真实变化命中自举范围，交付、目录和版本检查通过，且未提供Task编号或提供了尚未完成任务的编号
- **THEN** runner MUST执行适用动作，不查询、创建或修改Task记录

#### Scenario: 无任务自举推送失败后恢复
- **WHEN** 同一基线、交付、目标和宿主产生的单父后继提交尚未推送
- **THEN** runner MUST只恢复该后继推送，不重复同步或创建提交
- **AND** 其他基线、目标或未授权后继MUST保留并拒绝认领

#### Scenario: 规则与组件变化需要投射
- **WHEN** 已交付变化涉及根或项目/服务AGENTS.md、rules、skills、components或commands
- **THEN** runner MUST执行适用sync并验证开发入口与最终Doctor
