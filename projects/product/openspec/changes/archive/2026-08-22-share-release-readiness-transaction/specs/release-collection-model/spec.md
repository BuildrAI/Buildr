## ADDED Requirements

### Requirement: 共享 Release Context 必须只组合current owner facts
Buildr MUST使用唯一closed builder组合release selection、release HEAD/tree、Product Candidate aggregate、冻结artifact、main/dev、Task correlation、Task Environment、exact Node与publish workflow identity。Builder MUST只保存最低充分owner projection、portable locator与identity/digest，不得复制专业Result正文、stdout、caller-claimed success或旁路persistence。

#### Scenario: 构造完整dispatch context
- **WHEN** selection、Candidate、artifact、main、Task correlation、Environment、Node与workflow facts均可读取
- **THEN** builder MUST返回closed release context、稳定context digest和每个owner的current identity
- **AND** 相同规范化输入 MUST产生相同digest，任一owner identity变化 MUST产生不同digest

#### Scenario: 专业事实缺失或漂移
- **WHEN** 任一必需owner fact缺失、stale、schema不受支持或与release source不一致
- **THEN** builder MUST保留可读取的其他owner projection并形成对应finding输入
- **AND** MUST NOT从Task状态、历史stdout、文件路径或caller assertion补造缺失成功

### Requirement: Release Readiness 必须分阶段collect-all且无副作用
Buildr MUST让`pre-candidate`、`pre-main`、`dispatch-check`与hosted`pre-tag`使用同一context schema、currentness规则和finding codes。每个本地Readiness Result MUST返回stage、context identity、`ready|blocked`、全部findings、hosted deferred checks、next actions与`effects: []`；不得因首个失败丢弃其他finding。

#### Scenario: 本地候选准备检查
- **WHEN** 维护者在`pre-candidate`、`pre-main`或`dispatch-check`运行readiness
- **THEN** evaluator MUST完成所有适用只读检查并按owner输出全部finding
- **AND** OIDC、Environment approval、run/attempt与公共Registry mutation检查 MUST列为hosted deferred checks
- **AND** MUST NOT dispatch workflow、请求审批、创建tag、publish npm或修改GitHub Release

#### Scenario: 冻结dispatch context
- **WHEN** `dispatch-check`的全部本地必需检查通过
- **THEN** Result MUST把完整context标记为frozen并输出唯一context digest
- **AND** hosted workflow MUST逐字节消费并重新计算同一digest，不得接受后续重建的近似context
