## ADDED Requirements

### Requirement: Formal Verification执行前必须完成capability准备预检
Task Verification admission MUST在启动任何capability command、execution record、浏览器、外部系统或coordinated resource前，根据current selected capability declarations计算preparation closure，并与matching Task Environment Plan/Receipt及runtime invocation比较。preflight result MUST绑定selected capability、closure、Plan/Receipt与runtime invocation identities；runner MUST在execution open及首次capability副作用前按expected identities重验。只有结果current且`ready`时runner才能执行；preflight MUST不写Verification Result或直接写Environment store。

#### Scenario: 全部准备current
- **WHEN** selected capability identities、runtime invocation及所有基础和辅助Recipe prepared identities均匹配
- **THEN** admission MUST返回`ready`与稳定closure identity
- **AND** runner MUST使用Receipt execution route启动声明command，不重新解析全局PATH或安装依赖

#### Scenario: 准备闭包缺失
- **WHEN** selected capability要求的Recipe未进入matching Environment、output缺失或identity漂移
- **THEN** admission MUST在execution副作用前返回`blocked`、精确gap与由Task Environment消费的closed next action
- **AND** Task Verification workflow MUST先由Task Environment幂等prepare并重跑admission，不得让Agent手写安装命令

#### Scenario: 声明或外部条件无法恢复
- **WHEN** capability coverage缺失、declaration引用非法、runtime不兼容、authorization缺失或required external system不可用
- **THEN** admission MUST分别返回coverage gap、declaration invalid、preparation gap、authorization blocked或external-system unavailable及对应owner方向
- **AND** 只有声明Recipe可恢复的preparation gap才能生成supplemental Plan Request；MUST不扫描技术栈、回退全局工具、降低required capability或启动昂贵执行

#### Scenario: Preflight后identity发生变化
- **WHEN** preflight ready后selected capability、closure、Plan/Receipt或runtime invocation identity在execution open或首次副作用前变化
- **THEN** runner MUST零capability执行返回stale并重新进入admission
- **AND** MUST不复用旧ready、打开资源waiter或把旧closure关联到新execution

### Requirement: Verification准备闭包必须保持瞬态交接而非Result authority
Preparation closure、preflight状态、runtime invocation和Environment Receipt引用 MUST只服务当前execution admission；Task Verification Result MUST继续只保存Content Target、declaration identities、portable capability facts、coverage gaps与结论，不得复制机器路径、Recipe Step或Environment状态。

#### Scenario: 正式执行完成并记录Result
- **WHEN** current preflight ready后capability执行完成且Agent形成完整Verification结论
- **THEN** Result MUST记录portable capability facts与原declaration identity
- **AND** MUST不保存closure、runtime executable、node_modules路径或Environment Receipt正文

### Requirement: Formal Verification准备门禁必须允许安全降级
Preparation preflight MUST只阻止matching Formal Verification execution、current Result与依赖该Result的完成声明，MUST NOT成为日常开发、无关capability、只读调查、focused feedback或非正式检查的通用许可层。Buildr provider、Receipt writer或preflight暂不可用时，Agent MAY继续无关工作与有界非正式检查，但 MUST明确其不是Formal Verification，MUST NOT写current Result或据此声称完成；Buildr恢复后仍 MUST通过Task Environment与current admission建立正式事实。

#### Scenario: Buildr preflight暂时不可用
- **WHEN** Agent能够从权威源码和工具执行有界检查，但Buildr admission或Environment writer暂时不可用
- **THEN** Agent MAY继续无关开发、只读诊断或明确标记的非正式检查
- **AND** Formal Verification runner、Result record与完成声明 MUST保持blocked，直到matching Environment与admission恢复current ready

#### Scenario: 一个selected capability准备blocked
- **WHEN** selected capability的preparation gap阻止其Formal Verification execution
- **THEN** admission MUST只阻止依赖该gap的正式执行与结论
- **AND** MUST不因此阻止无关Task工作或未依赖该Recipe的非正式反馈
