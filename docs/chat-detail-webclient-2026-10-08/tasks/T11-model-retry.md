# T11 模型重试活动与错误原因

[返回任务总览](../README.md)

| 项目                   | 内容                                                          |
| ---------------------- | ------------------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                                |
| 优先级                 | P1                                                            |
| 阶段                   | B：协议与稳定性                                               |
| 前置任务               | [T03](T03-stream-end-failure.md)、[T13](T13-time-contract.md) |
| 证据类型               | 静态差异                                                      |
| 建档日期               | 2026-10-08                                                    |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR                               |

## 背景与差异

WebClient 将模型重试作为 run activity，并展示重试次数、等待与错误原因；当前缺少完整投影。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 消费重试 activity 的 attempt/max/delay/retryAt 等字段，限定当前 run/task。
2. 归一 overloaded、流中断、重试耗尽等原因。
3. 活动提示保持瞬态，不改写整轮业务终态。
4. 新 activity、终态、切换会话时及时清理，恢复时避免过期倒计时。

## 当前项目接入点

- [src/features/chatTimeline/timelineReducer.ts](../../../../src/features/chatTimeline/timelineReducer.ts)
- [src/features/chatTimeline/timelinePlatformError.ts](../../../../src/features/chatTimeline/timelinePlatformError.ts)
- [src/features/chatPersistence/components/ChatSystemAlert.tsx](../../../../src/features/chatPersistence/components/ChatSystemAlert.tsx)

## WebClient 参考入口

- [src/features/events/lib/processors/eventProcessorRun.ts](../../../../../agent-webclient/src/features/events/lib/processors/eventProcessorRun.ts)
- [src/shared/data/errors/platformError.ts](../../../../../agent-webclient/src/shared/data/errors/platformError.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 一次重试只有一条当前活动提示。
- [ ] 重试结束后无残留。
- [ ] 不把等待重试当作失败结束。
- [ ] 耗尽重试保留最终原因和部分文本。
- [ ] 历史或其他 run 活动不干扰当前 UI。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineReducer.test.mts](../../../../scripts/tests/chatTimelineReducer.test.mts)
- [chatTimelinePresentation.test.mts](../../../../scripts/tests/chatTimelinePresentation.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                      |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                           |
| 范围决定与协议样本           | 瞬态模型重试；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                 |
| 变更文件与设计取舍           | 当前 active run 与已知 active task 才投影 attempt/max/delay/retryAt 和归一原因；新进展、终态、离开/停止释放，超期提示一次清理；不写 snapshot、不增加倒计时热循环。 |
| 测试命令、结果与证据位置     | timelineReducer.ts、controller、ChatDetailScreen.tsx、i18n；chatWebclientSync 重试隔离/清理/持久化排除。；总览记录正式检查结果                                     |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                                  |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                    |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                 |
