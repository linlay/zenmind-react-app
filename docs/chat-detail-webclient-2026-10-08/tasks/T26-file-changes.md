# T26 文件修改汇总投影

[返回任务总览](../README.md)

| 项目                   | 内容                                           |
| ---------------------- | ---------------------------------------------- |
| 状态                   | [-] 本地实现完成；真实 Native 验收待 T31       |
| 优先级                 | P2                                             |
| 阶段                   | C：能力扩展（按范围选择）                      |
| 前置任务               | [T01](T01-tool-lifecycle.md)                   |
| 证据类型               | 静态差异                                       |
| 建档日期               | 2026-10-08                                     |
| 本期范围 / 负责人 / PR | 按完整目标实施；本地已落地 / Codex / 未创建 PR |

## 背景与差异

WebClient 汇总文件写入和编辑结果；移动端尚缺对应概览数据，而工具失败、重复 replay 不能记入成功修改。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 仅从成功 file write/edit 结果提取可靠文件路径与统计。
2. 按 run/path/call 去重，处理同文件多次修改。
3. 未知统计保留未知，不猜测增删行。
4. 通过现有鉴权预览打开资源并保留来源。

## 当前项目接入点

- [src/features/chatPersistence/components/runtimeStructuredPayload.ts](../../../../src/features/chatPersistence/components/runtimeStructuredPayload.ts)
- [src/features/chatPersistence/components/RuntimeTimelineRow.tsx](../../../../src/features/chatPersistence/components/RuntimeTimelineRow.tsx)
- [src/features/chatPersistence/markdownLinks/conversationMarkdownLinks.ts](../../../../src/features/chatPersistence/markdownLinks/conversationMarkdownLinks.ts)

## WebClient 参考入口

- [src/features/overview/lib/overviewState.ts](../../../../../agent-webclient/src/features/overview/lib/overviewState.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [x] 失败调用不计成功修改。
- [x] replay 不重复累加。
- [x] 同文件多次操作可追踪。
- [x] 未知值不伪造。
- [x] 资源打不开有明确提示。
- [x] 本地实时、回放与冷快照已补齐；真实 Native 仍待 T31。
- [x] 执行记录与 XGraph 已同步，临时状态清理见总览审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelinePresentation.test.mts](../../../../scripts/tests/chatTimelinePresentation.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 本地完成日期          | 2026-10-08；真实 Native 验收未完成                                                                                                                                                                                                                                      |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73` 加既有工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；Backend `b60bbf8a67e02cb569e90e08691b0821537438c6`                                                                                            |
| 范围决定与协议样本           | Backend `internal/tools/tool_file.go` 的 `written` / `edited`、`filePath`、`lineStats`；只统计已加载的完整成功 file_write/file_edit 工具，不从参数或 stdout 猜路径                                                                                                      |
| 变更文件与设计取舍           | 新增 `chatFileChanges.ts` 与 `components/ChatFileChanges.tsx`，ChatTimelineList 懒挂载入口，搜索栏复用工具入口及中英文；无第二份存储、schema、事件累计器、依赖或旧实现兼容空壳                                                                                          |
| 测试命令与结果               | `node --no-warnings --test --experimental-transform-types scripts/tests/*.test.mts` 698/698；`pnpm exec tsc --noEmit`、`pnpm lint`、生产 Web 导出通过；专项 8/8 覆盖 T26 五项及搜索接线回归                                                                             |
| 证据位置                     | `scripts/tests/chatFileChanges.test.mts` 与 `chatFileChangesNative.test.mts`：实时事件、重复回放、重复调用身份/较新失败、同文件多操作/跨 run、cold serializer、未知/溢出统计、未变节点零解析、鉴权 owner 和非法路径回退；组件测试使用实际组件与投影，宿主模拟不等于真机 |
| 真实后端 / Native 联调       | 未执行；需 AP/Desktop 实际资源数据面、iOS/Android 面板关闭后预览、返回键、长列表及安全区验收                                                                                                                                                                            |
| 迁移与回滚方式               | 直接从已有 timeline 派生，无数据迁移或库变更；移除本次面板/入口/纯函数即可回滚                                                                                                                                                                                          |
| 阻塞项与后续事项             | T00/T31 的实际部署与 Native 验收；汇总只含已加载工具，当前文件预览不代表历史版本                                                                                                                                                                                        |
| 临时状态清理与原有改动保护   | 最终审计见任务总览本轮记录；原有改动按预任务哈希和暂存区保护                                                                                                                                                                                                            |

面板关闭不遍历工具；打开后按节点引用 WeakMap 复用最多 128 Ki 字符的结果解析，普通正文/元数据刷新复用汇总数组。同 run/path 保留各 call 操作来源，重复回放不累加；任何缺失、非法或溢出统计显示 `?`。文件与操作合并为虚拟 FlatList，复用页面单例鉴权资源预览，保留执行 Agent、run/call/path 和时间。
