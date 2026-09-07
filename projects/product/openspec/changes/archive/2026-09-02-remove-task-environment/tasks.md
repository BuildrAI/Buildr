## 1. 删除产品能力

- [x] 1.1 删除Task Environment Domain/Application/Persistence/CLI/HTTP/module wiring与公共schema
- [x] 1.2 删除Plan/Receipt/Preparation/资源register-release/恢复/cleanup专属实现和测试
- [x] 1.3 删除capability contract、binding、Skill、manifest、Doctor和声明发现连接

## 2. 数据与界面

- [x] 2.1 新增一次SQLite migration直接删除task_environment_current和index，不保留双读或历史表
- [x] 2.2 删除Buildr Web Environment页签、API/DTO/client和专属Browser场景
- [x] 2.3 将Project preparation声明收窄为Agent可读的Project/Service入口，不保存Task选择或结果

## 3. 消费者与测试

- [x] 3.1 证明普通Task、OpenSpec、Review、Verification、Finish和交付在无Environment记录时工作
- [x] 3.2 保留Worktree、Preview、Self-bootstrap和Release独立安全边界并更新verification registry
- [x] 3.3 保留和修改的人工源码/测试使用TypeScript，确定删除的Environment专属文件直接删除

## 4. 当前认知与验证

- [x] 4.1 清理current specs、架构、流程、术语、CLI/JSON文档与历史兼容承诺
- [x] 4.2 运行strict/preflight、migration、typecheck、unit/contract/integration/system/browser、package和Doctor验证
