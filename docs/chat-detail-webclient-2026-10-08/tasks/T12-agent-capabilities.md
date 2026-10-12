# T12 Agent 输入能力与执行可用性

[返回任务总览](../README.md)

| 项目                   | 内容                            |
| ---------------------- | ------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收  |
| 优先级                 | P1                              |
| 阶段                   | B：协议与稳定性                 |
| 前置任务               | [T06](T06-model-config.md)      |
| 证据类型               | 静态差异                        |
| 建档日期               | 2026-10-08                      |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR |

## 背景与差异

WebClient 将 Agent 可执行性与历史可读性区分，并由 interactionConfig 控制输入能力；当前缓存策略可能永久保留首次空值或失败。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 建立 checking/available/unavailable/error 状态及 401/403/404 行为。
2. 历史可读与新执行授权分离。
3. 接入 interactionConfig 的六项控制，字段清单在 T00 固定，不向 query 透传配置对象。
4. 在现有 Agent detail 缓存与 single-flight 入口补充失败/空值刷新，能力变化时清理已失效的待发送选项；不建立能力中心或第二套永久缓存。

## 当前项目接入点

- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)
- [src/features/chatPersistence/components/Composer.tsx](../../../../src/features/chatPersistence/components/Composer.tsx)

## WebClient 参考入口

- [src/features/composer/hooks/useAgentAvailability.ts](../../../../../agent-webclient/src/features/composer/hooks/useAgentAvailability.ts)
- [src/features/composer/hooks/useAgentInteraction.ts](../../../../../agent-webclient/src/features/composer/hooks/useAgentInteraction.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 不可执行仍可阅读允许访问的历史。
- [ ] checking 不误放行。
- [ ] 权限变化后不会继续发送失效选项。
- [ ] 空值/临时错误可刷新恢复。
- [ ] 能力字段缺失有兼容默认。
- [ ] Agent/Team 能力不串缓存。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatAgentDetail.test.mts](../../../../scripts/tests/chatAgentDetail.test.mts)
- [chatDetailViewModel.test.mts](../../../../scripts/tests/chatDetailViewModel.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                                                                                                    |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                                                                                                         |
| 范围决定与协议样本           | Agent 能力与可用性；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                                                                                         |
| 变更文件与设计取舍           | 按 mode 默认值加服务端 interaction 六项布尔覆盖；模型/访问级别/本地附件实际准入；区分 checking/available/404/401/403/临时错误；成功 detail 30 秒缓存和 single-flight，失败可重试，换目标重置覆盖值。技能/connectors/chatRecords 可选 UI 未新增。 |
| 测试命令、结果与证据位置     | agentInteraction.ts、controller、composer、chatSyncService.ts；chatAgentDetail / chatWebclientService。；总览记录正式检查结果                                                                                                                    |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                                                                                              |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                                                                                                                |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                                                                                                  |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                                                                                               |
