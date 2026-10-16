# T15 技能与技能包单次选择

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

技能目录读取 id，单次选择经 references 的 skill 引用提交；TEAM 同样按根 agentKey 和 interactionConfig 校验能力，不单独持久化待重放发送选项。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 读取技能包能力，合并 pinned/configured/typed 等来源并以 ID 去重。
2. 技能目录读取 id，单次选择经 references 的 skill 引用提交；TEAM 同样按根 agentKey 和 interactionConfig 校验能力，不单独持久化待重放发送选项。
3. 明确发送后重置与失败恢复，避免变成全局持久默认。
4. 按实际协议禁用不支持的 Team/steer 路径。

## 当前项目接入点

- [src/features/chatPersistence/components/Composer.tsx](../../../../src/features/chatPersistence/components/Composer.tsx)
- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)

## WebClient 参考入口

- [src/features/composer/hooks/useComposerSkillMenuQuery.ts](../../../../../agent-webclient/src/features/composer/hooks/useComposerSkillMenuQuery.ts)
- [src/features/composer/lib/skillPackages.ts](../../../../../agent-webclient/src/features/composer/lib/skillPackages.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 列表与发送 ID 一致。
- [ ] 单次选择不会污染下一轮。
- [ ] 断网重试保留技能集合。
- [ ] Agent 切换清理失效选择。
- [ ] 不支持的 owner 或发送模式不透传。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatWsTransportPayload.test.mts](../../../../scripts/tests/chatWsTransportPayload.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项 | 结果 |
| --- | --- |
| 日期/版本 | 2026-10-08；移动端 HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73`、参考 `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`，均按实际工作树；目标后端部署版本未知 |
| 协议 | 技能目录读取 id，单次选择经 references 的 skill 引用提交；TEAM 同样按根 agentKey 和 interactionConfig 校验能力，不单独持久化待重放发送选项。 |
| 设计 | source service 复用 shared transport，30 秒成功缓存、single-flight、32 项上限和原 namespace generation；现有浮层+FlatList，不造菜单框架/全局默认/后台任务 |
| 选择/发送 | 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。 |
| 恢复 | SQLite 增量 must_use_skills_json 默认 []；历史合并保留；reconnect 检查原始要求，损坏行单独报错且不阻止其他 pending；失败重问按 client ID 取原选项 |
| 旧实现清理 | 技能目录读取 id，单次选择经 references 的 skill 引用提交；TEAM 同样按根 agentKey 和 interactionConfig 校验能力，不单独持久化待重放发送选项。 |
| 测试/构建 | 全量 635/635、`pnpm exec tsc --noEmit`、`pnpm lint`、Web 导出通过；证据 `chatSkills.test.mts`（生产菜单组件、键盘/Agent 切换、ID/包去重和坏行隔离）、service/query 专项、真实 node:sqlite 旧表升级/重复启动保留选项 |
| 迁移/回滚 | 追加列且默认空，无删库/新索引。旧客户端忽略列；带技能要求的 pending 保留新版处理或暂停派发，不能降级普通 query 自动重放 |
| 实际联调 | 后端 AP/Desktop、Agent configured/pinned 实际样本和 Native 手势/键盘/发送失败/重连仍待 T00/T31；未增加事件类型，request.query/history/snapshot 投影沿用原链路 |
| 清理 | 622 个基线文件中 585 个原哈希不变、37 个仅任务/派生变化；新增 3 个文件，暂存区一致；1,964 个生成文件恢复或不变，无新产物；临时日志/导出/两份基线移除；无依赖/lock/node_modules、Git 配置或环境文件变更 |

## 范围沿革

初始 P1 阶段暂缓；完整目标继续执行后实施本任务基本能力。原验收清单保留待真实环境联合验收，脚本 fixture 不冒充业务联调。
