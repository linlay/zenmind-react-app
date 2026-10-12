# T30 中断确认与真实终态专项

[返回任务总览](../README.md)

| 项目                   | 内容                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                                                        |
| 优先级                 | P1                                                                                    |
| 阶段                   | B：协议与稳定性                                                                       |
| 前置任务               | [T01](T01-tool-lifecycle.md)、[T05](T05-run-owner.md)、[T28](T28-snapshot-handoff.md) |
| 证据类型               | 待专项验证                                                                            |
| 建档日期               | 2026-10-08                                                                            |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR                                                       |

## 背景与差异

当前停止会先 detach/local cancel 再请求 interrupt，且有 unavailable guard；需验证服务端拒绝、未知结果和迟到事件下是否保留正确真实终态。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 覆盖 accepted:false、timeout、run_not_found 与实际仍运行的状态组合。
2. 区分乐观停止展示和服务端确认，避免 guard 永久掩盖活跃 run。
3. 防止重复 interrupt、迟到取消改写新 run 与历史 duration。
4. 修复仅限可复现缺口，不停止共享 socket。

## 当前项目接入点

- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatTimeline/timelineReducer.ts](../../../../src/features/chatTimeline/timelineReducer.ts)
- [src/features/chatRealtime/chatWsTransport.ts](../../../../src/features/chatRealtime/chatWsTransport.ts)

## WebClient 参考入口

- [src/features/conversation/hooks/useConversationActions.ts](../../../../../agent-webclient/src/features/conversation/hooks/useConversationActions.ts)
- [src/features/transport/lib/platformRunTransport.ts](../../../../../agent-webclient/src/features/transport/lib/platformRunTransport.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 明确拒绝不会永久显示假终止。
- [ ] 未知结果可受控 reconcile。
- [ ] not_found 不引发 attach 循环。
- [ ] 重复点击只处理当前 run。
- [ ] 迟到事件不污染新 run。
- [ ] Team 与其他 feature 不受影响。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineRunUnavailable.test.mts](../../../../scripts/tests/chatTimelineRunUnavailable.test.mts)
- [chatRealtimeReconcile.test.mts](../../../../scripts/tests/chatRealtimeReconcile.test.mts)
- [chatSyncCoordinator.test.mts](../../../../scripts/tests/chatSyncCoordinator.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                                                      |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                                                           |
| 范围决定与协议样本           | 中断真实终态专项；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                                             |
| 变更文件与设计取舍           | 删除无业务调用的本地假 cancel 和 preserveTerminalRunIds guard/helper；stop 仅 single-flight interrupt，保留观察 stream，接受/拒绝/超时均回读真实状态；run_not_found 不伪造 cancel，不改 duration。 |
| 测试命令、结果与证据位置     | chatSyncService.ts、timelineReducer.ts、index.ts；删除 9 条只覆盖废弃假终态的旧测试，新增真实终态与当前 run 隔离回归。；总览记录正式检查结果                                                       |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                                                |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                                                                  |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                                                    |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                                                 |
