# T10 分层压缩周期与主动压缩

[返回任务总览](../README.md)

| 项目                   | 内容                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                                                                                      |
| 优先级                 | 周期修复 P1；主动压缩为可选能力                                                                                     |
| 阶段                   | 周期修复 B；主动压缩 C（按范围选择）                                                                                |
| 前置任务               | 周期修复：[T13](T13-time-contract.md)；主动压缩纳入后另需 [T05](T05-run-owner.md)、[T12](T12-agent-capabilities.md) |
| 证据类型               | 静态差异                                                                                                            |
| 建档日期               | 2026-10-08                                                                                                          |
| 本期范围 / 负责人 / PR | 周期纳入；主动压缩暂缓 / Codex / 未创建 PR                                                                          |

## 背景与差异

当前已有压缩与 usage 展示；新版增加周期/分层语义，cycleComplete:false 时单步结束不代表整个周期完成，主动压缩也尚需补齐。

保留一个任务 ID，由 T00 分别决定周期协议修复和主动压缩的范围。周期修复按 P1 推进，主动压缩按可选能力处理；修复周期不强制新增主动操作。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 按 cycleId 和 level 区分 l1_tools/summary，归一 tokensFreed 等统计。
2. 明确 cycleComplete 的 true/false/missing 行为，防止过早完成。
3. 保证 usage 与压缩事件交错时预算及比例正确。
4. 仅在 T00 纳入主动压缩且 T05/T12 完成后，复用既有 API/service 与 compact 投影接入操作；提交中禁止重复触发，消费能力和 owner，不建立新的压缩管理框架。

## 当前项目接入点

- [src/features/chatTimeline/timelineContextCompact.ts](../../../../src/features/chatTimeline/timelineContextCompact.ts)
- [src/features/chatTimeline/usageSummary.ts](../../../../src/features/chatTimeline/usageSummary.ts)
- [src/features/chatPersistence/components/ContextCompactTimelineRow.tsx](../../../../src/features/chatPersistence/components/ContextCompactTimelineRow.tsx)
- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)

## WebClient 参考入口

- [src/features/runs/lib/contextCompact.ts](../../../../../agent-webclient/src/features/runs/lib/contextCompact.ts)
- [src/features/composer/hooks/useCompactChooser.ts](../../../../../agent-webclient/src/features/composer/hooks/useCompactChooser.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 多层同周期无重复完成。
- [ ] cycleComplete:false 保持处理中。
- [ ] 比例与 tokensFreed 不出现负数或重复累计。
- [ ] 两部分范围分别记录；主动压缩暂缓不阻塞已纳入的周期修复验收。
- [ ] 主动压缩纳入时，能力和 owner 正确、提交不重复、结果沿既有投影恢复；未纳入时不新增操作入口。
- [ ] 历史压缩不覆盖更新 usage。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineContextCompact.test.mts](../../../../scripts/tests/chatTimelineContextCompact.test.mts)
- [chatUsageHeaderBadge.test.mts](../../../../scripts/tests/chatUsageHeaderBadge.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                           |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                |
| 范围决定与协议样本           | 仅分层压缩周期；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                    |
| 变更文件与设计取舍           | cycleId 聚合同周期 L1 与 summary；cycleComplete=false 保持 active，最终 true 完成；不同 cycle 不混合，旧无 cycle 事件保留兼容。主动压缩按钮与接口暂缓。 |
| 测试命令、结果与证据位置     | timelineContextCompact.ts、timelineReducer.ts、types.ts；chatWebclientSync / chatTimelineContextCompact。；总览记录正式检查结果                         |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                     |
| 迁移与回滚方式               | 聊天缓存使用 schema 9；旧 scope 首次打开时一次性清空聊天表、对应目录快照及应用管理的资源图片缓存，新版本不重复清空，高版本拒绝降级打开；认证、来源配置、远端数据和用户原始文件保留。 |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                         |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                      |
