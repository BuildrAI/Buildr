## Why

四类外部系统已由完整连接技能（Connection Skill）承接，继续保留旧页面、硬编码实现和指引会造成两个当前入口。用户已决定退役旧机制并直接清理旧数据，自行在新模块建立实例。

## What Changes

- **BREAKING** 移除旧 `buildr connection` 专业能力及 `/connections` 应用接口，旧命令明确提示替代入口；旧页面地址跳转到唯一连接目录。
- **BREAKING** 删除旧实例、认证、偏好及专业状态，不迁移到团队文件或新个人认证；历史数据库迁移原文保留。
- 将 MySQL 执行内核及类型从旧模块迁入独立查询模块，接入程序与查询工具共享专用客户端，保留所有只读与结果边界。
- 移除旧预览认证复用参数；新连接的团队认证及当前配置按现有机制使用。
- 依据最终实现整理简洁的连接知识主文档，清理旧当前知识、活指引及失效引用，保留历史变更归档。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `external-connections`: 用旧机制退役及有界数据清理取代双轨与旧存储要求。
- `connection-management-ui`: 唯一连接入口及旧地址、历史标签接续。
- `connection-instance-files`: 移除旧机制并行承诺，保留新实例身份、共享与个人认证边界。
- `mysql-query`: 仅消费技能绑定实例，独立保留查询与本机偏好。
- `builtin-connection-skills`: 接入交付不再承诺保留旧实例。
- `nacos-config-management`: 用独立专业程序及明确接口目标取代旧路径兼容。
- `kibana-log-query`: 智能体（Agent）从绑定技能发现及使用专业程序。
- `worktree-buildr-web-preview`: 移除旧连接认证来源桥接。

## Impact

影响 Buildr 后端旧连接、MySQL 查询、启动装配、预览参数、SQLite 清理和 CLI/HTTP 表面；前端导航、旧页、标签恢复；随包技能指引、相关测试及连接当前知识。无外部系统写入，不改变 Codex/DSH 接入、不新增依赖。任务说明见[任务说明](@task/retire-legacy-connections)。
