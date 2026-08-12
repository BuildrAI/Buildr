## MODIFIED Requirements

### Requirement: 当前认知必须保持事实来源边界
Current knowledge MUST 解释 Project 当前事实但 MUST NOT 替代 canonical specs；发生冲突时 MUST 依次核对 canonical specs、当前实现与 registries、active Change artifacts、已确认 evidence，并只能将 archived Changes 与既有历史任务页面作为历史来源线索。

#### Scenario: knowledge 与 canonical spec 冲突
- **WHEN** 当前认知陈述与 canonical Requirement 不一致
- **THEN** Agent MUST 先确认规范或实现哪一方需要修正
- **AND** MUST NOT 通过只改 knowledge 掩盖规范冲突

#### Scenario: archive 包含旧行为
- **WHEN** archived Change 描述的行为已被后续 canonical spec 或实现替代
- **THEN** current knowledge MUST 表达当前行为
- **AND** MUST NOT 因历史 Change 存在而继续把旧行为当作当前事实

#### Scenario: task board 表达任务认知
- **WHEN** `task-boards/` 或 `task-cockpits/` 历史页面与当前认知同时存在
- **THEN** current knowledge maintenance MUST 将这些页面仅作为历史旁证，不得继续维护其工作状态
- **AND** overview、architecture、flows、services、glossary、canonical specs 与各专业 read model MUST 保持各自当前事实职责
