# T02 工具实时输出缓冲与展示

[返回任务总览](../README.md)

| 项目                   | 内容                                                      |
| ---------------------- | --------------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                            |
| 优先级                 | P1                                                        |
| 阶段                   | B：协议与稳定性                                           |
| 前置任务               | [T01](T01-tool-lifecycle.md)、[T13](T13-time-contract.md) |
| 证据类型               | 静态差异                                                  |
| 建档日期               | 2026-10-08                                                |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR                           |

## 背景与差异

WebClient 已提供工具 stdout/stderr 流与有界输出缓冲；当前移动端未形成对应的完整输出消费和展示链路。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 复用现有会话/run/tool 身份，按 T00 确认的 stream/chunkIndex 作用域处理增量和去重，允许 output 先于 start；只增加临时输出字段，不建立另一套工具生命周期。
2. 使用有界文本缓冲，参考 1 MiB UTF-8 上限保留头尾及截断提示；明确单工具、会话及 service 总内存上限，乱序暂存也计入预算。
3. result、工具或 run 失败/取消、会话释放和 service 停止时清理临时缓冲；缺少 result 也能释放，迟到输出不重建已终止工具的缓冲。临时输出不写 SQLite、冷缓存、transcript 或导出。
4. 为 Native 提供轻量文本面板，默认过滤 ANSI 控制序列；只有 T00 明确纳入才保留必要颜色支持，不实现终端模拟器或单独的输出持久化系统。

## 当前项目接入点

- [src/features/chatTimeline/timelineReducer.ts](../../../../src/features/chatTimeline/timelineReducer.ts)
- [src/features/chatTimeline/timelinePersistence.ts](../../../../src/features/chatTimeline/timelinePersistence.ts)
- [src/features/chatPersistence/components/RuntimeTimelineRow.tsx](../../../../src/features/chatPersistence/components/RuntimeTimelineRow.tsx)

## WebClient 参考入口

- [src/features/events/lib/toolOutputState.ts](../../../../../agent-webclient/src/features/events/lib/toolOutputState.ts)
- [src/features/terminal/lib/toolOutputTerminal.ts](../../../../../agent-webclient/src/features/terminal/lib/toolOutputTerminal.ts)
- [src/features/events/lib/processors/eventProcessorTool.ts](../../../../../agent-webclient/src/features/events/lib/processors/eventProcessorTool.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 乱序或重复 chunk 不重复拼接。
- [ ] 中文/emoji 截断不破坏字符。
- [ ] stdout/stderr 可区分。
- [ ] result 清理输出且不影响最终结果。
- [ ] 失败、取消、释放和停止在缺少 result 时仍释放缓冲，迟到输出不复活。
- [ ] 长输出内存有界，切换会话不串数据。
- [ ] 单工具、会话和 service 总量均有明确上限；ANSI 处理符合已确定的最小范围。
- [ ] SQLite、复制与导出不混入临时输出。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineReducer.test.mts](../../../../scripts/tests/chatTimelineReducer.test.mts)
- [chatTimelinePersistence.test.mts](../../../../scripts/tests/chatTimelinePersistence.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                                 |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                                      |
| 范围决定与协议样本           | 有界瞬态工具输出；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                        |
| 变更文件与设计取舍           | 复用 tool 节点与现有 UI debounce（48ms）；每工具 stdout/stderr 各 32 KiB，总 64 KiB，每会话 256 KiB；UTF-8 头尾截断、跨 chunk ANSI 清理、chunkIndex 去重。输出不进入 SQLite。 |
| 测试命令、结果与证据位置     | toolOutput.ts、RuntimeTimelineRow.tsx、runtimePayloadDescriptor.ts、chatWebclientSync.test.mts；不增加终端引擎。；总览记录正式检查结果                                        |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                           |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                                             |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                               |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                            |
