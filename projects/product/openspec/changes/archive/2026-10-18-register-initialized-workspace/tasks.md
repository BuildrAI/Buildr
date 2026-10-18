## 1. 默认登记与阶段结果

- [x] 1.1 在初始化应用声明并复用 `ensureRegisteredTarget`，按源资产准备、本机登记、运行时（Runtime）同步与最终诊断的顺序接续；由有界检查确认普通初始化产生当前产品的本机条目，重复已有登记不重复写入，`--source-only` 不新增登记或管理归属记录。
- [x] 1.2 校准初始化帮助和阶段输出，区分登记失败与后续运行时（Runtime）失败；由有界检查确认错误保留具体原因、源资产和已成立登记，不输出整体成功，也不要求重复初始化或重复手动添加目录。

## 2. 初始化与登记边界验证

- [x] 2.1 扩展现有初始化代表旅程及必要有界测试，覆盖默认与明确智能体（Agent）选择、重复初始化、纯源资产模式、非法参数零登记、登记冲突及后续运行时（Runtime）失败；检查使用独占工作目录和本机数据目录，断言实际登记文件、管理归属与阶段结果。
- [x] 2.2 经既有隔离执行器运行受影响的初始化代表旅程和登记保护检查，确认发布版与开发版范围隔离、身份冲突、文件锁（File Lock）及比较后交换（Compare-and-Swap，CAS）保护仍成立，且检查未写入真实用户登记；记录实际通过结果和未覆盖范围。

## 3. 首次使用说明一致性

- [x] 3.1 更新 `services/buildr/docs/cli-reference.md`、`knowledge/docs/guides/getting-started.md`、随包 `services/buildr/resources/runtime/skills/buildr/SKILL.md` 及适用的 `references/asset-maintenance.md`，明确普通初始化自动登记、`--source-only` 边界、失败接续与网页配置顺序；回读正文并检查相关链接与实现一致。
- [x] 3.2 协调本任务文档阶段中的根 `README.md`、`README.en.md`，以简短指令完成安装、初始化和打开，再由 Buildr Web 配置工作范围；核对中英文事实一致，未暗示登记会启动服务、自动完成业务配置或把登记等同于运行时（Runtime）准备成功。
