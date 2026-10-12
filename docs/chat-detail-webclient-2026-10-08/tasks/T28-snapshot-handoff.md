# T28 快照与 attach 交接专项

[返回任务总览](../README.md)

| 项目                   | 内容                                                 |
| ---------------------- | ---------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                       |
| 优先级                 | P1                                                   |
| 阶段                   | B：协议与稳定性                                      |
| 前置任务               | [T05](T05-run-owner.md)、[T13](T13-time-contract.md) |
| 证据类型               | 待专项验证                                           |
| 建档日期               | 2026-10-08                                           |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR                      |

## 背景与差异

移动端已有 reconcile、attach 与守卫，不能仅根据 reset/merge 实现差异断言故障；需用受控时序验证快照与实时交接。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 建立 detail/attach/query 延迟与乱序 fixture，观察快照游标和 live 事件归并。
2. 验证同会话重载及 A-B-C 快速切换的 token/owner/source 隔离。
3. 验证历史分页不会覆盖当前 live/awaiting。
4. 仅对复现的缺口修复，已有保护以回归证据关闭。

## 当前项目接入点

- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatPersistence/useChatDetailConversationController.ts](../../../../src/features/chatPersistence/useChatDetailConversationController.ts)
- [src/features/chatPersistence/chatProjector.ts](../../../../src/features/chatPersistence/chatProjector.ts)

## WebClient 参考入口

- [src/features/conversation/hooks/useConversationStreamHandoff.test.ts](../../../../../agent-webclient/src/features/conversation/hooks/useConversationStreamHandoff.test.ts)
- [src/features/conversation/hooks/useConversationWsRuntime.ts](../../../../../agent-webclient/src/features/conversation/hooks/useConversationWsRuntime.ts)
- [src/features/conversation/lib/chatSurfaceReplay.ts](../../../../../agent-webclient/src/features/conversation/lib/chatSurfaceReplay.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 快照前后事件不丢不重。
- [ ] 旧请求不覆盖新会话。
- [ ] 重载不清空当前有效增量。
- [ ] 旧页不替换最新状态。
- [ ] 无缺口时记录测试证据而非无必要重写。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatRealtimeReconcile.test.mts](../../../../scripts/tests/chatRealtimeReconcile.test.mts)
- [chatDetailAsyncScope.test.mts](../../../../scripts/tests/chatDetailAsyncScope.test.mts)
- [chatSyncCoordinator.test.mts](../../../../scripts/tests/chatSyncCoordinator.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                        |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                             |
| 范围决定与协议样本           | 快照交接专项；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                   |
| 变更文件与设计取舍           | 复现并修复 detail await/DB await 期间 live 增量回退；按 lifecycle/revision 拒绝旧源；旧页保留已完成工具，权威 run 终态收口缺失的活动子节点；旧快照不能覆盖真实终态。 |
| 测试命令、结果与证据位置     | chatWebclientService.test.mts 延迟响应/写库/换源/历史页四类 fixture；chatWebclientSync 实际终态合并。；总览记录正式检查结果                                          |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                  |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                                    |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                      |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                   |
