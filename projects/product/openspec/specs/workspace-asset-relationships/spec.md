# workspace-asset-relationships Specification

## Purpose
定义项目（Project）、业务服务（Service）与代码库实例（Repository Instance）的引用基数、稳定身份和唯一事实来源，支持共享业务实现、独立代码基础及历史定位兼容，并保证关系变更不会隐式删除代码或改变其他项目。

## Requirements

### Requirement: 项目与服务多对多
项目 MUST 通过 `serviceIds` 引用零个或多个全局服务；同一服务 MUST 可被多个项目引用。反向项目列表 MUST 从引用派生。

#### Scenario: 解除一方关联
- **WHEN** 两个项目共用服务且其中一个解除关联
- **THEN** 系统 MUST 仅移除该项目引用，其他关联、服务和代码保持不变

### Requirement: 服务与代码库多对一
每个服务 MUST 引用且只引用一个代码库实例；多个服务 MUST 可引用同一实例。可选模块路径 MUST 限定在被引用代码库内。

#### Scenario: 两个业务共用代码
- **WHEN** 生猪服务和鸡蛋服务引用同一代码库实例
- **THEN** 系统 MUST 保留两个服务身份并解析到同一代码基础

#### Scenario: 非法路径与无效引用
- **WHEN** 服务引用不存在的代码库或模块路径逃逸代码库
- **THEN** 相关写入 MUST 被拒绝且不产生部分登记

### Requirement: 关系写入核对当前事实
关系修改 MUST 核对当前版本、双方稳定身份与工作空间，并在同一写入事务内重新验证。读取无效引用 MUST 显式报告局部诊断，不静默删除。

#### Scenario: 目标在保存前发生变化
- **WHEN** 关系编辑期间目标登记或清单版本发生变化
- **THEN** 系统 MUST 拒绝陈旧写入并允许重读，不覆盖其他修改

### Requirement: 历史定位和显式迁移
旧清单读取 MUST 零写入；显式迁移 MUST 保留稳定身份、历史任务定位和代码内容，并以可恢复事务切换唯一清单。旧服务业务边界 MUST 不根据 Git 地址自动合并或拆分。

#### Scenario: 迁移中断
- **WHEN** 清单迁移中断或校验失败
- **THEN** 系统 MUST 保留可恢复现场，不把半完成状态报告为成功

#### Scenario: 旧任务与链接
- **WHEN** 迁移后读取旧项目服务定位的任务或链接
- **THEN** 系统 MUST 通过明确映射解析原身份，解除当前关系不删除历史事实
