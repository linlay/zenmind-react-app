# T16 KBASE Editing 模式

[返回任务总览](../README.md)

| 项目                   | 内容                                                  |
| ---------------------- | ----------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                                            |
| 优先级                 | P2                                                    |
| 阶段                   | C：能力扩展（按范围选择）                             |
| 前置任务               | [T12](T12-agent-capabilities.md)                      |
| 证据类型               | 静态差异                                              |
| 建档日期               | 2026-10-08                                            |
| 本期范围 / 负责人 / PR | 完整目标继续执行；本地实现 / Codex / 未创建 PR |

## 背景与差异

WebClient 已按 Agent 类型区分 KBASE Editing 与 CODER Planning；当前已有 planningMode，不能用同一个开关语义替代。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 按类型和能力显式区分 editing/planning。
2. editingMode 仅开启时以 true 发送。
3. 保存本次 outbox 选项并在失败、重发时恢复。
4. 切换 Agent 或能力失效时清理不可用模式。

## 当前项目接入点

- [src/features/chatPersistence/components/Composer.tsx](../../../../src/features/chatPersistence/components/Composer.tsx)
- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)

## WebClient 参考入口

- [src/features/composer/hooks/useAgentInteraction.ts](../../../../../agent-webclient/src/features/composer/hooks/useAgentInteraction.ts)
- [src/shared/data/api/dto/commands.ts](../../../../../agent-webclient/src/shared/data/api/dto/commands.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] KBASE 与 CODER 控件和 payload 不混用。
- [ ] 关闭时不发送多余字段。
- [ ] 重试不丢本次模式。
- [ ] 能力关闭后无法带入陈旧模式。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatWsTransportPayload.test.mts](../../../../scripts/tests/chatWsTransportPayload.test.mts)
- [chatTimelineRequestVariant.test.mts](../../../../scripts/tests/chatTimelineRequestVariant.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项 | 结果 |
| --- | --- |
| 日期与版本 | 2026-10-08；移动端 HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73`，参考 `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；均以实际工作树为准，部署版本未知 |
| 协议 | 对齐 `isDedicatedKbaseWorker` 和 query DTO：仅 Agent detail.mode=KBASE 可 Editing；CODER Planning 保留独立选项；关闭时不发送 editingMode |
| 设计 | 复用模式按钮、source service、现有 outbox 和主键查询；不增加设置引擎、全局默认、索引、依赖或持久连接 |
| 状态 | Editing 成功发送清除、失败保留；Agent/会话切换或模式不可用清除；Team/Planning 混用发送前拒绝；steer 不透传；发送与运行时禁改模式 |
| 持久化/恢复 | editing_mode 增量列默认 0；旧行不变，历史合并保留，冷启动/reconnect replay 读取原值并校验当前能力；失败消息重问按原 client ID 读取本次选项 |
| 测试 | 全量 626/626，`pnpm exec tsc --noEmit`、`pnpm lint` 通过；定向 Editing/service/query/performance 43/43，最终扩大至 async scope/composer 的回归 58/58；Web 导出成功。SQLite 迁移使用 node:sqlite 内存数据库执行真实初始化代码 |
| 证据 | `chatEditingMode.test.mts`、`chatWebclientService.test.mts`、`chatWsTransportPayload.test.mts`；不是实际后端样本 |
| 迁移与回滚 | 追加列、旧行默认关闭；初始化幂等，不删库。旧客户端会忽略新增列，带 Editing 的未发送 pending 应保留新版处理或暂停派发；不可降级成普通 query 后自动重放 |
| 实际联调 | 后端/AP/Desktop 与 Native 控件、切换、失败恢复仍待 T00/T31 验证；未新增事件类型，原 request.query/history/snapshot 投影继续使用既有链路 |
| 清理 | 621 个基线文件中 584 个原哈希不变、37 个仅本任务/派生变化；新测试 1 个、暂存区一致；1,964 个生成文件恢复或不变，无新产物；本轮临时导出/日志/基线移除；未修改 lock/node_modules、Git 配置或环境文件 |

## 范围沿革

初始 P1 阶段暂缓；完整目标继续执行后本轮完成 T16 本地实现。原验收清单保持待真实环境联合验收，不将脚本测试等同业务验收。
