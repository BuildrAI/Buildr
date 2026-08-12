## ADDED Requirements

### Requirement: Environment Receipt必须审计Declaration到Step事实
新Task Environment writer MUST保存closed `buildr.task-environment-receipt/v5`，并在同一Receipt中表达Preparation Declaration、Task scope、Recipe、Step及其聚合状态。每个required Declaration、Recipe与Step均ready时Environment才 MUST返回ready；任一missing、drifted或failed MUST使整体blocked。

#### Scenario: 两个依赖根均fresh
- **WHEN** Product Task worktree中`buildr`与`buildr-web`准备outputs均不存在
- **THEN** prepare MUST分别执行两个Recipe Step并保存两个effect
- **AND** 全部成功后Receipt MUST返回ready

#### Scenario: 只有buildr-web缺失
- **WHEN** `buildr` Step仍current而`buildr-web` output缺失
- **THEN** inspect MUST只读报告对应Recipe/Step missing且不创建目录
- **AND** prepare MUST只执行`buildr-web` Step

#### Scenario: 声明或输入漂移
- **WHEN** Preparation Declaration、Recipe、executable或Step input identity与prepared identity不同
- **THEN** inspect MUST只读返回blocked/stale diagnostic
- **AND** prepare MUST只在current Plan来源重新确认后恢复受影响Step

#### Scenario: Step失败
- **WHEN** required Recipe Step以非零状态退出
- **THEN** Environment MUST整体blocked并保留其他成功事实
- **AND** diagnostic MUST包含scope、Recipe、Step、退出信息与next action

### Requirement: inspect与saved GET必须保持不同只读语义
CLI Environment `inspect` MUST只读观察saved Plan绑定的声明、Recipe、executable、inputs与outputs；Local App GET MUST只读取SQLite current。两者 MUST不执行Step、不创建或修复outputs、不替换Plan或Receipt。

#### Scenario: Local App刷新Environment Tab
- **WHEN** 用户刷新Environment Tab
- **THEN** 页面 MUST展示最近保存的Declaration、Recipe、scope与Step状态
- **AND** GET MUST不打开Project声明或文件系统形成新结论

### Requirement: 旧Plan与Receipt只读兼容
Task Environment reader MUST能够只读展示`buildr.task-environment-plan/v1`与Receipt v4为legacy；新prepare writer MUST只生成Plan v2与Receipt v5，且 MUST不从旧Step推断Declaration或Recipe identity。

#### Scenario: v4 current请求prepare
- **WHEN** current只有legacy v4且调用方未提交Selection Request
- **THEN** prepare MUST返回blocked并要求显式选择Recipe或task-inline Plan
- **AND** MUST保留旧current值，不自动升级
