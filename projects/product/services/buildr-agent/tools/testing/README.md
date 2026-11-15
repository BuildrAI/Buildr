# Harness 独立检查

在 `services/buildr-agent` 使用当前准备环境的 Node/npm：

- `npm run build`：独立构建运行负载和公共 HTTP 声明。
- `npm test` / `npm run test:static`：本服务单元、边界和生产类型检查，不调用 Development 测试实现。
- `npm run test:integration -- --group agent-integration-harness-product`：真实后台及目录宿主。
- `npm run test:integration -- --group agent-integration`：包含独立 HTTP/来源化程序权限；完整成员以 `--list` 为准。

完整集成入口依据唯一检查目录遍历各组；执行器继承 `BUILDR_VERIFICATION_WORKER_BUDGET`，不扩大外层授予的并发。

真实旧版兼容需单独准备未修改参考包，而非对当前实现设置 v1 标识：

```sh
node tools/testing/prepare-v1-compatibility.ts 974612e171af0a551cccaa6e8880735944bac717 > /tmp/harness-v1-reference.json
BUILDR_AGENT_V1_PACKAGE="$(node -p 'JSON.parse(require("node:fs").readFileSync("/tmp/harness-v1-reference.json","utf8")).packageRoot')" npm run test:integration -- --group agent-integration-compatibility
```

准备工具只读取准确 Git 提交，在独立临时目录按旧锁文件安装依赖、构建并物化原旧包；记录提交和客户端摘要。测试不修改旧客户端，覆盖旧/新客户端与旧/新服务四格、旧轮控制、存储升级及禁止不兼容并行。完成后按返回的准确 `root` 清理参考包；不要删除用户目录或以此操作日常资料。失败会清理本次准备目录。

这些检查使用替身执行器，不消耗真实模型额度、不继承日常账号；通过不表示已获得其他桌面平台、真实模型或发行许可的证据。
