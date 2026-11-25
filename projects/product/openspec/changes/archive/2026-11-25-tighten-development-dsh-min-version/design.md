# 技术设计

- `src/installation.ts` 将 `supportsDevelopment` 收紧为 `0.1.0-rc.67 <= version < 0.2.0-0`，并在 macOS 探测顺序中先检查 `~/Applications/Buildr Development.app` 以支持隔离用户级安装验证；
- `tools/build-dev.ts` 将正式包的 `buildrCompatibility.requires[0].versions.minInclusive` 更新为 `0.1.0-rc.67`；
- 新增 `tools/verify-desktop-pair.ts` 与 `test/verify-desktop-pair.test.ts`，在精确 Node `24.15.0` 下离线安装目标 `@buildr-ai/buildr` 原包、安装启动器并接入 DSH `0.2.x` 桌面宿主进程完成边界检查、票据/入口验证与双环境（本地 npm 源及 HTTP tarball 直链）安装一致性检查。
