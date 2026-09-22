## MODIFIED Requirements

### Requirement: Project必须使用v4测试地图声明稳定测试体系
Project根`verification.yml` MUST使用`buildr.project-verification/v4`，按少量testing families声明`id`、title、Project/Service scope、purpose、source paths、test roots、完整command或Agent guide、可选选择提示和requirements，并 MAY通过可选`location`明确路径根。声明MUST NOT逐项登记测试文件、Task选择、Candidate、Plan、Execution Record、DAG或测试结果。完整入口 MUST覆盖该族声明的真实测试范围；智能体 MUST核对实际工具，不以入口名称或存在文件代替覆盖判断。

#### Scenario: 前后端项目声明测试体系
- **WHEN** Project已有后端单元/功能测试、前端单元/组件/Browser测试和环境冒烟说明
- **THEN** Agent MUST将其归纳为少量稳定testing families
- **AND** 具体测试类、文件和本次任务选择MUST不进入声明

#### Scenario: 完整入口不覆盖声明测试根
- **WHEN** 一个测试族声明集成和系统测试，而实际完整入口只执行集成测试
- **THEN** Agent MUST使测试族范围与真实完整入口一致，可拆成消费各自已有入口的测试族
- **AND** MUST不把未执行的系统测试报告为完整通过

## ADDED Requirements

### Requirement: 测试地图必须明确路径根与证明范围的区别
每个测试族 MUST最多绑定一个路径根。`location` MUST为闭合结构`{kind: project}`或`{kind: service, service: <Service code>}`；省略时 MUST保持项目根语义，规范化 MUST不要求补写省略字段。服务绑定 MUST引用当前项目已登记且属于该族`scope.services`的服务代码。`scope` MUST只表达证明范围，不根据服务数量自动选择路径根。`sourcePaths`、`testRoots`与命令的`full.cwd` MUST相对绑定根，MUST拒绝绝对路径、父目录穿越与反斜杠穿越。声明 MUST不保存本机解析后的绝对根。

#### Scenario: 原有项目根声明保持兼容
- **WHEN** 既有v4测试族没有`location`且覆盖一个或多个服务
- **THEN** 其全部路径 MUST继续相对项目根，候选规范化 MUST不强制新增字段

#### Scenario: 外部服务代码库拥有自己的测试入口
- **WHEN** 测试族绑定已登记服务且该服务代码位于项目目录之外
- **THEN** Buildr MUST根据当前登记的真实服务来源解析根，路径 MUST相对该服务根
- **AND** MUST不要求复制源码到项目目录或在声明中写绝对路径

#### Scenario: 多服务采用不同测试工具
- **WHEN** Java、前端与Python服务分别拥有测试入口
- **THEN** Agent MUST允许分别绑定各服务的独立测试族
- **AND** 跨服务完整旅程 MUST使用真实项目聚合入口或按服务分别执行并汇总，MUST不猜测共用命令

#### Scenario: 无效绑定与畸形输入
- **WHEN** 服务绑定未知、未包含在scope中、字段不合法、scope.services不是数组或路径越界
- **THEN** 地图校验 MUST返回明确结构诊断并拒绝更新
- **AND** MUST保持原地图内容不变，不抛出未处理的输入类型错误

### Requirement: 地图读取必须提供局部的当前执行位置观察
`project verification inspect|validate|update` MUST在结构有效时提供逐测试族的只读`locations`，包含测试族身份、根种类、适用服务代码、当前根、命令工作目录、`ready|unavailable`与诊断。Agent指引 MUST要求执行前重读位置及适用规则，按真实工作目录原样调用已声明命令；Buildr MUST不执行命令或展开测试发现。Agent入口的工作目录 MUST为null，保留根供指引使用。根或命令工作目录不可用、不是目录、或真实工作目录越出绑定根时 MUST只将相关位置标记为unavailable；结构有效地图 MUST仍可读取和维护，其他族与真实任务报告 MUST不因此失效。

#### Scenario: 同项目部分服务尚未就绪
- **WHEN** 一个已登记服务的代码根缺失，另一个服务根存在
- **THEN** locations MUST分别返回unavailable及ready，并说明缺失原因
- **AND** 结构有效地图 MUST保持ready，Agent MUST继续其他已授权可执行检查并如实说明局部缺口

#### Scenario: 命令目录通过符号链接离开绑定根
- **WHEN** full.cwd词法上相对安全但实际目录解析到了绑定根之外
- **THEN** 该族位置 MUST为unavailable且不得报告可执行cwd
- **AND** MUST不改变其他族的解析结果或将目录观察写回声明

#### Scenario: 位置观察不替代执行证明
- **WHEN** 地图返回ready位置
- **THEN** Agent MUST继续核对入口、测试范围、环境及授权后实际执行
- **AND** MUST不将位置解析成功解释为测试通过或命令覆盖完整
