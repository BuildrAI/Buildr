## MODIFIED Requirements

### Requirement: 并行检查必须拥有独立状态并服从资源限制
Buildr SHALL 将独立临时工作空间、随机端口、浏览器与清理责任成立的检查声明为独立执行对象并允许有界并行，不能只因共用不可变构建产物强制串行。共享可变资源的检查 SHALL 继续按真实资源互斥，执行 SHALL 记录实际重叠、隔离与清理。

#### Scenario: 两个独立代码页面检查
- **WHEN** 文件浏览与源代码管理消费同一不可变正式前端产物
- **THEN** 它们 SHALL 拥有独立现场并在实际资源预算内重叠执行，旧固定本机档位保留最多两个浏览器会话，机器初始预算及明确覆盖可联合调整额度

### Requirement: 日常公开命令必须具有确定语义
Buildr SHALL 从主体服务的项目包装入口提供 `npm test`、`npm run check`、`npm run test:static`、`npm run test:integration`、`npm run test:e2e`、`npm run test:system` 和 `npm run test:related`。`test` SHALL 运行四服务全部单元，`check` SHALL 完整选择当前源码静态与单元，类型入口 SHALL 选择对应完整集合，`test:system` SHALL 组合集成与端到端完整集合而不新增类型。旧日常档位、逐页面和五类定位命令 SHALL 撤销并迁移现行消费者。

#### Scenario: 推送前全量检查
- **WHEN** 智能体（Agent）准备推送 Buildr 产品代码
- **THEN** SHALL 调用 `check` 并核对覆盖四服务且对应准确待推送内容，不能因本次仅改文档而缩小声明集合

#### Scenario: 全量入口传入缩小选择参数
- **WHEN** 调用方试图用显式检查参数缩小 `check`
- **THEN** 入口 SHALL 拒绝缩小或保持完整集合，并明确其实际语义

## ADDED Requirements

### Requirement: 集成与端到端必须具有共同完整入口
Buildr SHALL 提供`npm run test:system`，从同一登记选择当前源码Integration与E2E的完整并集，使用同一个执行计划、准备去重和资源预算。测试类型不得被当作必须串行的依赖；原类型入口和实际环境缺口 SHALL 保留。

#### Scenario: 查看共同计划
- **WHEN** 用户调用`test:system -- --plan`
- **THEN** 计划 SHALL 覆盖两类完整集合且无重复，不启动业务执行，并展示最终资源档位

#### Scenario: 独立组同时可执行
- **WHEN** 两类中的独立检查已满足依赖且共同预算允许
- **THEN** 调度器 SHALL 允许它们重叠，而真正共享写入和具名资源约束仍有效

### Requirement: 本机预算必须体现机器观测与明确覆盖
非CI默认执行 SHALL 依据可用CPU并行度和内存约束形成有界初始预算，同时保留显式固定档位与CI默认。自动外层宽度 SHALL 不超过3；四路并发已证明会使真实浏览器、原生Agent与进程交接检查不稳定，因此工作空间重型组也最多并行三组。浏览器并发 SHALL 保持2；对话journey内部 SHALL 使用1个worker串行，因为同一组两个worker并行会使setup、tasks和recovery场景相互争抢并产生真实失败。三组及以上的实际准入 SHALL 保留至少4份工作空间I/O，允许两组重型生命周期重叠；更低宽度机器沿用更小I/O额度。`BUILDR_VERIFICATION_JOBS` SHALL 调整实际准入的组宽度与重工作区、读写额度，不得仅修改一个不起作用的表面数字；浏览器正确性容量和已有单组最低需要 SHALL 保留。计划及证据 SHALL 说明观测、策略、覆盖与实际额度，无效输入 SHALL 在准备前失败。

#### Scenario: 不同机器
- **WHEN** 机器的CPU或内存限制不同且未指定固定档位或宽度
- **THEN** 初始负载预算 SHALL 随观测变化，且保持可执行单个既有检查所需的最低额度

#### Scenario: 明确固定档位
- **WHEN** 调用方选择旧固定档位或在CI未作覆盖
- **THEN** 相应固定容量 SHALL 保持可重复，不受机器观测偷偷改变

#### Scenario: 显式覆盖
- **WHEN** 调用方提供合法的`BUILDR_VERIFICATION_JOBS`
- **THEN** 父计划与子执行 SHALL 采用一致的相关额度并保留该覆盖来源；非法值不得进入准备

#### Scenario: 四路重型组
- **WHEN** 显式覆盖允许四个外层组且存在四个工作空间重型检查
- **THEN** 调度 SHALL 最多同时准入三组重型检查；自动机器初始宽度本身不超过3

### Requirement: 队列等待必须可以解释
执行证据 SHALL 区分本地准入约束等待与跨执行资源租约等待，并保留实际挡住检查的依赖、容量、资源或独占原因及区间。多个同时原因不得被相加当作墙钟耗时，也不得仅有总排队时间而无约束来源。

#### Scenario: 浏览器被占满
- **WHEN** 待执行组因浏览器数量不足或I/O额度不足而等待
- **THEN** 证据 SHALL 分别指出实际约束，释放后记录等待区间，不改变原准入或资源释放结果

### Requirement: 重型生命周期组不得随额度增长占满全部I/O
真实Agent进程、Archify和嵌套Git等重型生命周期组 SHALL 以有界工作空间I/O需求参与准入，不得把申请量设为当前全部额度。额度足够时 SHALL 允许有界重叠；额度不足时 SHALL 保持原有互斥。具名正确性锁、组内工作进程与进程预算、清理责任和其他资源约束 SHALL 不因该调整放大。

#### Scenario: 四份工作空间I/O额度
- **WHEN** 实际准入额度允许四份工作空间I/O且两个重型生命周期组满足依赖
- **THEN** 最多两组 SHALL 可重叠，`agent-process-tests`等具名资源约束仍按原容量生效

#### Scenario: 三份或更少工作空间I/O额度
- **WHEN** 实际准入额度不超过三份
- **THEN** 重型生命周期组 SHALL 保持原互斥，不得以提高并发为由放大实际工作进程或进程数量

### Requirement: 真实失败必须以原断言复现收口
验证中的产品或夹具失败 SHALL 保留原断言和期限，通过定点复现、确定性反例和目标检查通过关闭；不得以放宽期限、删除断言、跳过真实服务或把取消场景算作通过来收口。关闭后 SHALL 在完整适用集合复核，并如实保留平台与环境缺口。

#### Scenario: 竞争性失败修复
- **WHEN** 失败由真实竞争窗口导致
- **THEN** 反例 SHALL 在旧实现上稳定复现同一错误，在新实现上通过，且兄弟用例和整组无回归

#### Scenario: 浏览器场景失败传播
- **WHEN** 单个场景内的请求转发失败
- **THEN** 失败 SHALL 归属当前场景并完成清理，后续独立场景不得因父测试提前结束而被取消
