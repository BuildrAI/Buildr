## 1. 自举 Skill runner

- [x] 1.1 将确定性 runner 与命令入口合并迁入 `skills/buildr-self-bootstrap-sync/scripts/closeout.mjs`
- [x] 1.2 让脚本通过 Product CLI 只读取得同一 Finish Result，并保持Environment Node、阶段结果和same-run resume边界
- [x] 1.3 更新自举 Skill、Component contribution与完整目录integrity，确保普通Workspace不可获得该能力

## 2. 产品发布边界与验证

- [x] 2.1 删除Product `src/`中的self-bootstrap runner与内部driver，更新集成/契约测试以从Skill脚本验证行为
- [x] 2.2 增加package dry-run断言，证明npm发布内容不包含self-bootstrap runner或入口
- [x] 2.3 运行Skill脚本专项测试、Task Finish相关测试、静态/打包检查与Workspace runtime sync/Doctor反馈

## 3. 当前认知与收敛

- [x] 3.1 更新Buildr Service与OpenSpec lifecycle当前认知，明确runner属于自举Skill而非用户产品包
- [x] 3.2 完成Brief、knowledge impact与术语核对，执行严格OpenSpec验证
- [x] 3.3 完成确定性Converge所需checklist并准备同步canonical spec与归档Change
