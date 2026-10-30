# 共享浏览器授权资源

Buildr管理本机个人工作空间的浏览器配置（Profile）、运行实例及页面使用权。专业程序负责站点登录和自己凭证的核验。共享配置不等于共享访问令牌（Token），不授予业务写入权限；不同工作空间和身份不隐式共享。

## 配置管理

`buildr connection-skill browser list --target <workspace> --json` 只读查看。其他动作经 `--file <本机JSON文件|->` 输入：

- `inspect`：`{"id":"personal"}`。
- `create`：`{"id":"personal","expectedRevision":"absent"}`，全新私有目录。
- `adopt`：`{"id":"personal","expectedRevision":"absent","directory":".buildr/local/<既有私有目录>"}`，仅在明确授权后原位置接管，不搬动、合并或清空登录资料。
- `reset`：`{"id":"personal","expectedRevision":"<当前观察版本>","confirmSharedReset":true}`，清空整个共享配置，影响所有引用方，必须独立明确授权。存在运行实例或外部占用线索时拒绝。Windows外部占用证明未实现时拒绝重置，不伪报已验证。

越界、符号链接、身份不明或版本变化时保留现场，不删除锁、终止其他进程、复制日常浏览器资料或自动换配置。

## 专业程序接入

现有 `authentication.authorization` 可加 `browserProfile: personal`，其余配置、程序和完整认证组协议保持。列表与帮助不启动浏览器；未声明的旧方法保持原行为。接入候选必须等支持该字段的产品可用后激活，不先覆盖当前有效方法。

程序经私有进程间通信（IPC）取得 `context.browser`：

```js
const { createBrowserClient } = await import(context.browser.clientModule);
const browser = createBrowserClient(context);
try {
  const { targetId } = await browser.pipe.request('Target.createTarget', {url: 'https://目标站点', background: true});
  const { sessionId } = await browser.pipe.request('Target.attachToTarget', {targetId, flatten: true});
  // 执行该站点的登录与凭证核验，确需人操作时激活自己的页面。
  // browser.pipe.on('event', handler) 只接收本次页面及衍生弹窗的事件。
} finally {
  await browser.close(); // 只关闭本客户端页面，不关闭共享浏览器。
}
```

程序不接收原始配置路径、调试端口或浏览器级控制权，不能接管别人的页面、全局读取Cookie或执行Browser.close。共享资源边界不等于对专业程序的恶意代码沙箱，程序来源仍须明确可信。

登录返回与保存继续走原授权私有通道，不把凭证放进参数、普通输出、日志、源码或技能。准确站点、账号、环境、租户由专业程序核验；业务凭证失效不自动等同于身份提供方登录过期。需要本人扫码/确认时显示实时窗口并等待，不循环重放业务写入。

取消仅释放本次页面。关闭失败保留清理状态并回查，不宣称已清理；持久登录配置在运行实例退出后保留。真实迁移、产品激活、账号切换和业务写入分别核对授权。
