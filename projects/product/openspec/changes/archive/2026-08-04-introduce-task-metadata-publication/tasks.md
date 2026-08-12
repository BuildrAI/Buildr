## 1. Writer ownership 与 capability contract

- [x] 1.1 为 Task Record、Development、Verification 与 Review contracts 增加唯一 portable exact owned path declaration，并保持 schema/read-model authority 不变
- [x] 1.2 新增 `buildr.task-metadata-publication/v1` contract，固定输入、snapshot、Git Operations、Result、local-only、reference diagnostic 与失败边界

## 2. 唯一 Skill 与确定性 helper

- [x] 2.1 新增唯一 `task-metadata-publication` Skill，required 消费 `buildr.git-operations/v1`，写清 commit/push 独立调用与禁止 authority
- [x] 2.2 实现无状态 `scripts/publication.mjs` 的 preflight/snapshot/post-commit verify/equivalent-commit/range evidence，不执行 Git mutation
- [x] 2.3 对齐 helper declaration table 与四个 writer contracts，确保 Environment、Finish、asset-review、runtime、Candidate 与其他 Task 永不进入 eligible set

## 3. Package、routing 与 current docs

- [x] 3.1 更新 package manifest、workspace Skills baseline、initial binding、provider/requires 与完整目录投射资产
- [x] 3.2 更新 package static validation、architecture/publication tests，证明唯一入口、capability binding、随附 helper与旧Git routes不恢复
- [x] 3.3 更新 roadmap交付边界、skill capability contracts、CLI reference与bootstrap guide；不宣传公共Metadata Publication CLI

## 4. 行为测试

- [x] 4.1 覆盖五个portable paths全部/部分/全部缺失，以及Environment、Finish、asset-review、runtime与其他Task排除
- [x] 4.2 覆盖无关dirty/staged/untracked保留、occupied/symlink/corrupt/ownership conflict与snapshot后drift fail closed
- [x] 4.3 覆盖独立commit、独立push、commit后push、完整range越界、push rejection与部分失败Result
- [x] 4.4 覆盖等价metadata commit安全复用、共享Candidate commit不amend、无Gitlocal-only与历史reference diagnostic
- [x] 4.5 覆盖publication失败不改变Task status、Development Candidate/generation或Finish evidence

## 5. Current knowledge 与正式交付

- [x] 5.1 Reconcile Brief、knowledge impact、canonical specs与受影响current docs，运行strict/proposal/convergence门禁
- [ ] 5.2 完成focused与affected反馈，进入Task Development形成policy、正式Verification、Candidate、Completion Review与handoff
- [ ] 5.3 通过Task Finish集成并push `dev`，从retained Product source sync Codex runtime，验证唯一入口/binding与Doctor
- [ ] 5.4 完成Task Metadata Publication后续metadata-only commit/push、Task terminal update、Environment/worktree/branch与transient evidence cleanup
