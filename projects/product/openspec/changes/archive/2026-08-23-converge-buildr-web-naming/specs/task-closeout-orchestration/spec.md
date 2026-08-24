## MODIFIED Requirements

### Requirement: Self-bootstrap activation 必须复用 Task Finish target lease
Buildr 自举 Workspace 的bundled runner MUST在任何retained target fast-forward、sync、successor commit/push、Development Buildr Web安装或重启、开发入口验证、最终Doctor或same-run Finish resume副作用前，以canonical Workspace、Task/run和稳定self-bootstrap投影中的Workspace repository `leaseTargetIdentity`通过retained Product内部driver获取同一Task Finish target lease。Runner MUST原样使用冻结exact identity，不得由`remote + targetBranch`或本机路径重新计算。matching retained Doctor blocked current row与matching terminal complete row MUST都可作为self-bootstrap owner；terminal row只临时持有lease普通列，不得改变terminal Result、Task状态或重新打开Finish。

为迁移已存在的run，旧bundled runner仍以`remote:targetBranch`请求时，retained Product MAY仅在matching run的冻结repository set中恰有一个applicable repository命中该逻辑target时解析为其exact identity。零匹配、多匹配、Workspace/Task/run不匹配或错误exact identity MUST在activation副作用前fail closed；新runner MUST不主动使用该兼容路径。

Runner MUST在每个潜在副作用阶段前刷新有界activation lease，并在全部返回路径按token fencing释放。same-run Product Finish resume可能自行释放或在terminal finalize清除lease；runner MUST在后续activation前重新获取/刷新，并把最终重复release视为幂等。另一个owner占用相同exact target时，runner MUST以空activation effects返回可重试waiting diagnostic；不同repository identity不得互相阻塞。过期terminal activation lease MUST可由后续owner安全接管，Doctor MUST继续报告未过期/过期lease事实。

#### Scenario: Complete Result 取得 activation lease
- **WHEN** terminal complete Finish Result命中self-bootstrap动作且相同exact target没有current owner
- **THEN** runner MUST使用投影的Workspace repository `leaseTargetIdentity`让matching terminal row持有有界target lease
- **AND** activation结束后 MUST token-fenced release，且terminal Result与Task状态保持不变

#### Scenario: Retained Doctor blocked Result 复用同 run lease
- **WHEN** doctor-blocked Finish Result进入runner且相同run仍是matching current row
- **THEN** runner MUST以投影的exact repository identity获取或刷新同一target lease，并在最终same-run Finish resume后幂等释放
- **AND** MUST不创建第二套lease表、runner receipt或外部lock authority

#### Scenario: 旧 runner 唯一兼容恢复 existing run
- **WHEN** 已存在current或terminal run由旧runner传入`remote:targetBranch`且matching repository恰好一个
- **THEN** retained Product MUST在同一owner边界把请求解析为该repository冻结的exact identity
- **AND** MUST允许该旧runner完成首次自举迁移而不重跑原Formal Finish

#### Scenario: 旧 runner identity 存在歧义
- **WHEN** 旧runner请求的逻辑target匹配零个或多个applicable repository，或Workspace、Task、run任一不匹配
- **THEN** driver与runner MUST在Git、sync、安装、Doctor和Finish resume零副作用状态停止
- **AND** MUST不猜测Workspace repository、不创建新run或把logical identity持久化为lease key

#### Scenario: 另一个 Task 正在交付同一 target
- **WHEN** foreign Finish deliver已持有相同exact repository target lease
- **THEN** self-bootstrap runner MUST在sync、Git、安装、重启、Doctor与Finish resume零副作用状态返回target waiting
- **AND** foreign Task与其他Task MUST仍可继续各自carrier preparation/verify/Delivery Adaptation

#### Scenario: Self-bootstrap 占用时另一个 Task 到达 deliver
- **WHEN** runner已持有activation lease，而另一个Task已独立准备好carrier并进入相同exact repository target的deliver
- **THEN** Product Finish MUST只让该deliver返回同run可恢复的target occupied诊断
- **AND** MUST不丢弃其carrier、不重建Candidate，也不得把整个Workspace Finish串行化

#### Scenario: 普通用户 Workspace
- **WHEN** Workspace未安装`buildr-self-bootstrap` Component
- **THEN** 普通Finish MUST继续只在既有deliver临界区使用短target lease
- **AND** MUST不获得terminal activation lease、self-bootstrap runner或新增post-Finish阶段

