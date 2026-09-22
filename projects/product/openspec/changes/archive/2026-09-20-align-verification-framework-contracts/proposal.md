## Why

Buildr 的通用测试验证指导已采用 v4 测试地图，但部分当前规范仍要求 v3 或已退役的执行入口；地图也无法明确表达项目目录之外的服务代码根。Buildr 自身还存在完整入口与声明范围不一致、真实源码变化漏选必要回归的问题，影响智能体（Agent）建设和使用测试的可信性。

## What Changes

- 为 v4 测试族（Testing Family）增加可选项目／服务路径根绑定，并在地图读取与校验时返回当前解析位置；省略字段保持原有项目根语义。
- 对齐当前规范、随包技能（Skill）、字段参考与模板，指导按服务实际能力声明、按真实根执行，不恢复退役的统一测试执行器。
- 保留 Buildr 的 `buildr-functional` 身份并限定集成测试，新增对应既有 `test:system` 的系统测试族；拆出对应前端 `npm test` 的 `buildr-web-unit`，让 `buildr-web` 只声明浏览器检查实际覆盖的测试根，共形成六个测试族；修复测试选择路径并用回归验证漏选。
- 校准已有架构文章与代码地图（Code Map），用真实测试对象、入口、证明范围和实例说明 Buildr 产品自身的覆盖边界；明确后端回归和候选入口不自动涵盖独立前端逻辑及浏览器检查，更新开发预览与验证证据。
- 按现行源技能（Skill）维护 `project-testing-guidance`：定向检查不能冒充完整覆盖，验证中发现缺口可以在授权内补测，核对当前内容及证据适用性后再记录任务报告，清除退役统一执行模型的残留表述。
- 不迁移用户声明、不创建用户项目的测试工具、不安装或发布。本次为兼容扩展；使用新绑定字段需要支持该字段的 Buildr，原声明不必改写。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-test-capabilities`：声明路径根、只读位置解析及局部不可用语义。
- `project-declaration-intake`：发现和维护当前 v4 地图，按真实事实重建旧声明。
- `npm-cli-package`：安装包验证使用现有公开入口和项目测试工具。
- `product-verification-quality`：对齐产品测试入口与真实完整／受影响范围。
- `buildr-web-browser-verification`：浏览器验证从当前工具链和项目入口取得环境依据。

## Impact

涉及 `services/buildr/src/modules/project-testing`、既有工作空间查询能力、随包验证技能与契约、Product `verification.yml`、`test/verification/ownership.ts`、必要回归及相关知识。`project-testing-guidance` 只按已存在的技能与报告职责进行事实维护，不增加新的执行能力或门禁。无新依赖、数据库迁移或前端交互变化；Task 验证报告结构保持不变。此前已完成的知识分页变更独立保留。
