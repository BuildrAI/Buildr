## REMOVED Requirements

### Requirement: Skill 必须在写入前同步最新代码
**Reason**: 用户已确认移除强制同步前置，旧成功和失败条件整体由下方独立动作要求替代。
**Migration**: 保留现有记录与 Git 现场；只有实际目标需要代码更新时才独立调用已选 Git 提供者。

## ADDED Requirements

### Requirement: Skill 必须按明确提交观察范围生成日报
产品 Skill MUST 在生成前明确目标日期、时区和相关仓库，默认从当前本地引用收集当日提交及更改文件，固定每个引用的完整提交标识与观察时点。Skill MUST 使用本机用户邮箱按去空白、大小写不敏感比较确定 authorship，构造四问摘要与合法 Task 关联。引用、截至时间及未覆盖范围 MUST 写入现有 daySummary.drawbacks；未确认远端时 MUST 明确本地范围，MUST NOT 宣称覆盖远端最新或所有分支。生成 MUST NOT 以本地工作目录干净、Git 更新、资产同步或全局 Doctor ready 为前置；无法取得真实提交或用户必需的数据范围时 MUST 保留旧日报。

#### Scenario: 本地有未提交内容
- **WHEN** 本地提交可读取但工作目录有未提交内容
- **THEN** Skill MUST 使用已提交内容生成日报，并说明未提交内容未纳入
- **AND** MUST NOT 为日报执行 stash、rebase 或覆盖工作目录

#### Scenario: 离线或无关诊断异常
- **WHEN** 本地引用可读取，远端不可用或全局诊断存在与日报无关的问题
- **THEN** Skill MUST 可生成明确标注本地观察范围的日报，不调用资产同步

#### Scenario: 按需取得远端最新信息
- **WHEN** 用户明确要求远端最新数据且相关授权成立
- **THEN** Skill MUST 独立获取所选远端引用并直接从该引用收集提交，不要求检出或变基
- **AND** 获取失败且用户只接受远端最新时 MUST 保留旧日报；允许本地范围时 MUST 明确降级范围

#### Scenario: 无法取得提交事实
- **WHEN** 目标无可读 Git 提交、引用不明确或数据不能满足用户必需范围
- **THEN** Skill MUST 报告缺口且不调用 record，不伪造提交或静默缩小必需范围

#### Scenario: 重复生成同一天日报
- **WHEN** 新观察范围与已保存日报不同，准备覆盖同一天文件
- **THEN** Skill MUST 明确范围变化，保留此前约定范围或已获授权的新范围，不静默丢失已包含仓库或引用
