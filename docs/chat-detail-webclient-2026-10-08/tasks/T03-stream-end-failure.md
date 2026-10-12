# T03 输出段失败、部分内容与迟到事件

[返回任务总览](../README.md)

| 项目                   | 内容                                                      |
| ---------------------- | --------------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                            |
| 优先级                 | P1                                                        |
| 阶段                   | B：协议与稳定性                                           |
| 前置任务               | [T01](T01-tool-lifecycle.md)、[T13](T13-time-contract.md) |
| 证据类型               | 局部复现                                                  |
| 建档日期               | 2026-10-08                                                |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR                           |

## 背景与差异

当前失败 content.end 可能显示 complete 且丢失 errorReason，迟到 delta 还能恢复 active；WebClient 对内容和思考流结束失败有独立归一。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 接入 content/reasoning 结束失败字段及统一错误原因。
2. 失败时保留已输出内容和 startedAt。
3. 区分片段终态、整轮终态与后续合法重试的新片段。
4. 拦截同片段迟到数据对终态的改写。

## 当前项目接入点

- [src/features/chatTimeline/timelineReducer.ts](../../../../src/features/chatTimeline/timelineReducer.ts)
- [src/features/chatTimeline/timelinePlatformError.ts](../../../../src/features/chatTimeline/timelinePlatformError.ts)
- [src/features/chatPersistence/chatProjector.ts](../../../../src/features/chatPersistence/chatProjector.ts)

## WebClient 参考入口

- [src/features/events/lib/processors/streamEndFailure.ts](../../../../../agent-webclient/src/features/events/lib/processors/streamEndFailure.ts)
- [src/features/events/lib/processors/eventProcessorContent.ts](../../../../../agent-webclient/src/features/events/lib/processors/eventProcessorContent.ts)
- [src/features/events/lib/processors/eventProcessorReasoning.ts](../../../../../agent-webclient/src/features/events/lib/processors/eventProcessorReasoning.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 失败结束保留部分文本。
- [ ] 错误原因可展示并可历史恢复。
- [ ] 迟到 delta 不复活旧片段。
- [ ] 新的合法片段仍可输出。
- [ ] 正常结束和 cancel 不误判为 failure。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineReducer.test.mts](../../../../scripts/tests/chatTimelineReducer.test.mts)
- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                            |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知 |
| 范围决定与协议样本           | 失败输出与迟到事件；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                 |
| 变更文件与设计取舍           | failed content/text end 保留首段时间、部分内容与错误；flush 后不再改写成普通完成。reasoning 展示关闭与真实流结束分别处理。               |
| 测试命令、结果与证据位置     | timelineReducer.ts、chatSyncService.ts、chatWebclientSync.test.mts；保留旧缓存读取兼容。；总览记录正式检查结果                           |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                      |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库        |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                          |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                       |
