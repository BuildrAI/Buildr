# 方法与结果

`inspect [--json]` 有界读取最多 64 KiB 专业标准输入（Standard Input），只输出完整摘要、字节数、明确实例及非秘密账号和认证来源；不打印原始认证，不访问远端。`check-context` 还通过私有进程间通信（IPC）请求宿主核对本次版本；核验失败或未知动作均非零退出，不进行写入。

对象定位始终使用宿主注入的 `connections.primary.id`；类别（Category）不推断其他动作。团队与个人用户名密码整组选择，不自行遍历认证目录、不失败换源。程序无真实发布能力，配置成功和测试退出成功都不能表述为业务完成。

`test/discover` 是独立的只读槽位（Hook）示例，标准输出（Standard Output）只包含一个 JSON 对象，必须有 `status`。`config.scenario` 仅供本机模拟测试，分别验证 `success/failure/unknown`，以及缺少状态或混入日志时的无效结果；不能作为真实适配的业务选项。`scopes` 先用地址和完整认证组发现固定 `local-catalogue` 文本编号，之后才选择必填 `scope`。草稿只读槽位（Hook）不请求写前再核验，不保存场景或认证。

实际验证由 `test/fixtures/connection-authoring-cli-check.ts` 经唯一隔离执行器（Isolated Runner）运行：真实技能（Skill）登记、目录发现、绑定、团队文件创建、专业帮助、业务输入与私有认证并行、个人覆盖和写前上下文协议。全部账号与域名均为模拟值；没有真实系统验证、正式发布或公司认证。
