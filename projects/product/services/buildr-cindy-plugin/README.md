# Buildr Cindy 插件

桌面集成通过左栏进入 Buildr 首页，通过右栏按会话工作空间复用正式页面。插件沿用
`buildr-workspace` ID，可原位更新。分别通过 Cindy Forge 打包和安装，使用现有 Buildr Dev
Web 实例（本地默认 `http://127.0.0.1:4458`），无独立服务进程。若使用额外的本机实例，
打包前在清单填写其精确端口。

Cindy 的左栏和右栏会向页面供给语义颜色，Buildr Web 消费这些变量。单独在浏览器打开时
使用 Buildr 原有网页颜色。独立的 Cindy 主题包通过 Cindy 的主题设置导入和选择。

用 Node 按 Cindy 的加载方式检查插件解析入口：

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"workspaceWeb.resolve","params":{"workdir":null}}' | node -e 'require("./worker.cjs")'
```
