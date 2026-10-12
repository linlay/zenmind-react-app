# T13 严格远端时间契约与旧缓存兼容

[返回任务总览](../README.md)

| 项目                   | 内容                            |
| ---------------------- | ------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收  |
| 优先级                 | P1                              |
| 阶段                   | B：协议与稳定性                 |
| 前置任务               | [T00](T00-protocol-baseline.md) |
| 证据类型               | 局部复现                        |
| 建档日期               | 2026-10-08                      |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR |

## 背景与差异

当前远端时间解析接受秒级字符串等宽松输入；WebClient 采用严格 epoch milliseconds 契约。直接全局收紧又可能损坏旧 SQLite 数据。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 在远端入口严格解析，区分旧缓存读取与本地乐观时间生成；不全局替换时间 helper 或要求所有调用者走新兼容框架。
2. 按事件契约校验安全整数 epoch ms 和必需字段。
3. 无效远端时间不得静默以 Date.now 伪造，记录可诊断拒绝/降级。
4. 检查旧缓存实际格式；只有确实不兼容才在现有读取/反序列化入口兼容或迁移，已归一毫秒不重复转换。复核消息排序、已读、usage、duration。

## 当前项目接入点

- [src/core/api/services/chatEventProtocol.ts](../../../../src/core/api/services/chatEventProtocol.ts)
- [src/features/chatPersistence/chatProjector.ts](../../../../src/features/chatPersistence/chatProjector.ts)
- [src/features/chatTimeline/timelinePersistence.ts](../../../../src/features/chatTimeline/timelinePersistence.ts)
- [src/features/chatPersistence/chatRepository.ts](../../../../src/features/chatPersistence/chatRepository.ts)

## WebClient 参考入口

- [src/shared/utils/platformTime.ts](../../../../../agent-webclient/src/shared/utils/platformTime.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 字符串、秒级或不安全数字按已确认契约处理。
- [ ] 缺失必需时间不伪造顺序。
- [ ] 合法毫秒跨端一致。
- [ ] 旧缓存可打开且不丢数据。
- [ ] 本地新消息仍可生成本地时间。
- [ ] 迁移幂等。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)
- [chatTimelinePersistence.test.mts](../../../../scripts/tests/chatTimelinePersistence.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                                                                                          |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                                                                                               |
| 范围决定与协议样本           | 严格远端时间边界；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                                                                                 |
| 变更文件与设计取舍           | stream 校验安全整数 epoch ms 与 timestamp；push 禁 transport timestamp、使用业务必需时间；detail 校验 events/runs/read/awaiting/messages/artifact 的已提供时间。只收紧远端入口，不改旧 SQLite helper、不以 Date.now 修补非法 wire 值。 |
| 测试命令、结果与证据位置     | chatRemoteTimeProtocol.ts、chatWsTransport.ts、chatSyncService.ts；chatWebclientSync / wsClientTransport / desktopWsProtocol。；总览记录正式检查结果                                                                                   |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                                                                                    |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                                                                                                      |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                                                                                        |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                                                                                     |
