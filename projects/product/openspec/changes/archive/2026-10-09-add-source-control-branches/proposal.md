## Why

当前源代码管理只能读取当前位置的本地历史，无法在明确工作位置直接切换分支（Branch），也缺少远程范围与独立作者（Author）筛选。用户已采用第七版原型（Prototype），需要基础功能接入真实工作现场；本次新增窄写入能力，不破坏既有只读接口（API）和固定版本阅读。

## What Changes

- 各工作位置提供上限 72px 的紧凑名称入口和相邻操作浮层（Popover），只支持安全切换或打开已有占用位置。
- 新增本地、远程分支（Branch）清单及显式切换写入。远程独有项建立本地跟踪分支（Tracking Branch）并切换；已有对应本地项保持自身成果。
- 历史增加完整引用（Ref）与作者（Author）邮箱组合筛选，分页和游标包含过滤条件；固定同排重置全部条件。查看与实际切换保持独立。
- 不新增独立创建、删除、整合、日期和路径筛选，不隐式联网或保存、丢弃现有内容。现有调用保持兼容。

## Capabilities

### New Capabilities

- `code-branch-management`: 明确工作位置的分支（Branch）清单、版本保护和有界检出（Checkout）切换。

### Modified Capabilities

- `code-source-control`: 紧凑管理入口与独立历史筛选，保留真实来源和只读查看、固定版本阅读。

## Impact

影响 buildr 的 code 应用、显式超文本传输协议（HTTP）读写契约和共享数据传输对象（DTO），以及 buildr-web 的源码管理组件（Component）、读取与操作适配和必要测试。新增写入不进入只读工作进程（Worker）或自动命令映射，不增加依赖或新的服务（Service）。
