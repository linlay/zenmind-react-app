# T23 整轮 transcript 复制与正文搜索

[返回任务总览](../README.md)

| 项目                   | 内容                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| 状态                   | [-] 本地实现与回归已落地；Native 联合验收待完成                                           |
| 优先级                 | P2                                                                                        |
| 阶段                   | C：能力扩展（按范围选择）                                                                 |
| 前置任务               | [T01](T01-tool-lifecycle.md)、[T02](T02-tool-output.md)、[T03](T03-stream-end-failure.md) |
| 证据类型               | 静态差异                                                                                  |
| 建档日期               | 2026-10-08                                                                                |
| 本期范围 / 负责人 / PR | 纳入本期：整轮已加载内容复制、已加载正文搜索 / Codex / 未创建 PR                          |

## 背景与差异

WebClient 提供整轮 transcript 与搜索；旧清单 TODO-18 为整轮复制，移动端已有局部文本复制能力无需重做。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 建立 Query/Thinking/Tools/Answer 的纯 transcript 投影，确定空段、失败和部分内容格式。
2. 遵循现有复制权限和敏感字段规则，不包含工具临时 stdout/stderr。
3. 在 T00 分别确认复制和搜索范围，独立验收。搜索默认仅扫描已加载正文并明确提示范围；全历史搜索只在本期明确要求且数据入口确认后实施，不预建全文索引或搜索系统。
4. 命中定位与分页/live 更新协调，避免抢滚动。

## 当前项目接入点

- [src/features/chatTimeline/timelineDisplay.ts](../../../../src/features/chatTimeline/timelineDisplay.ts)
- [src/features/chatTimeline/timelinePresentation.ts](../../../../src/features/chatTimeline/timelinePresentation.ts)
- [src/features/chatPersistence/components/ChatTimelineList.tsx](../../../../src/features/chatPersistence/components/ChatTimelineList.tsx)

## WebClient 参考入口

- [src/features/timeline/lib/runTranscript.ts](../../../../../agent-webclient/src/features/timeline/lib/runTranscript.ts)
- [src/features/timeline/lib/timelineTextSearch.ts](../../../../../agent-webclient/src/features/timeline/lib/timelineTextSearch.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 整轮内容顺序正确。
- [ ] 失败仍可复制已有文本。
- [ ] 临时输出及敏感字段不混入。
- [ ] 搜索范围对用户明确。
- [ ] 复制与搜索分别记录范围；未纳入搜索时不增加搜索代码，默认搜索不自动拉取全历史。
- [ ] 加载更多后命中可更新。
- [ ] 流式输出不劫持当前定位。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineDisplay.test.mts](../../../../scripts/tests/chatTimelineDisplay.test.mts)
- [chatTimelinePresentation.test.mts](../../../../scripts/tests/chatTimelinePresentation.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现、回归和清理已完成，真实 Native 联合验收未完成                                                                                                                                                                                                                                                                                     |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73` 加本任务工作区；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；Backend `b60bbf8a67e02cb569e90e08691b0821537438c6`。实际部署版本仍待 T00                                                                                                                                                        |
| 复制范围                     | 指定 Run 的已加载 Query / Thinking / Tools / Answer，空段省略；未终结标记 partial，失败/取消保留已产生正文及安全状态。保留既有局部复制。用户、最终回答、过程摘要和错误行提供整轮入口，沿用既有剪贴板/提示路径                                                                                                                                               |
| 搜索范围                     | 仅已加载 user/assistant 正文源码（含 Markdown），UI 明示范围；合法闭合 VIEW/viewport 协议块排除，普通/未闭合代码仍按展示源码搜索。不包含工具输出、reasoning、诊断或 awaiting 元数据。不自动请求全历史；不同于 WebClient 去 Markdown 后的纯文本搜索，不增加第二个 Markdown 解析器                                                                            |
| 变更文件与设计取舍           | 新增 `chatRunTranscript.ts`、`chatTimelineTextSearch.ts` 和两个小型复制/搜索组件；接入既有 timeline/footer/过程摘要/错误行，补中英文。复用 display model、现有 Markdown segment parser 和敏感字段过滤；不序列化原始节点、附件或 toolOutput/stdout/stderr。未存在可删除的旧整轮复制/搜索实现，既有局部复制仍有独立用途                                       |
| 性能与定位                   | 复制仅显式点击时投影，复用列表已缓存 display items；搜索关闭时不建缓存/不扫描，输入防抖 180ms，流式刷新按同一窗口合并。按节点正文与 query 缓存命中，仅重新解析/匹配变化的正文；最多保留前 1,000 条导航记录但显示全部命中数，输入最多 128 字符。node ID + ordinal 保持分页/流式选中，显式定位先展开过程再滚动；搜索期间暂停自动跟随，实时计数更新不触发滚动  |
| 测试命令、结果与证据位置     | 三个专项测试 9/9：`chatTranscriptSearch.test.mts`、`chatTextSearchNative.test.mts`、`chatTimelineSearchNavigation.test.mts`；全量 `node --no-warnings --test --experimental-transform-types scripts/tests/*.test.mts` 693/693；`pnpm exec tsc --noEmit`、`pnpm lint`、生产 Web 导出均通过。AST/React Native surface harness 验证实际组件/回调，不能代替真机 |
| 实时、回放与冷启动           | 同一 loaded timeline 纯投影；覆盖实时正文增长、工具元数据更新不重扫、历史前插、rich snapshot 冷恢复同结果、失败/部分/error-only Run、敏感字段和合法 VIEW 排除。无新增协议/持久化或重放副作用                                                                                                                                                                |
| 真实后端 / Native 联调       | 尚未完成；T00/T31 验证实际历史样本、剪贴板、窄屏 footer/搜索栏、软键盘、折叠定位及分页/流式滚动。模拟 Native surface 与 Web 导出不记为真实 Native 验收                                                                                                                                                                                                      |
| 迁移与回滚方式               | 无 schema/数据迁移、依赖或配置变更；删除本任务新增 helper/组件并撤回列表接入即可，无需删库                                                                                                                                                                                                                                                                  |
| 阻塞项与后续事项             | 本地完成不关闭整体验收；继续 T24–T27，并保留 T00/T31 实际部署/Native 门禁                                                                                                                                                                                                                                                                                   |
| 临时状态清理与原有改动保护   | 清理审计结果见任务总览末尾；复核暂存区与原有修改，恢复构建产生的 `.expo` 文件，移除本轮自建基线、日志、备份与 Web 导出                                                                                                                                                                                                                                      |

## 本次范围记录

2026-10-08：按完整计划推进 T23 最小范围，整轮复制与已加载正文搜索独立实现。UI 不暗示覆盖服务端全历史；部分历史或仅回复的 Run 不补造缺失 Query。复制和搜索不会读取数据库/直接操作 Socket，也不会持久化临时搜索状态。搜索关闭、切会话或卸载清理 timer/cache/选择；命中超过上限时明确提示只导航前 1,000 项。

本地自动化覆盖验收项，但真实 Native 尚未确认，验收清单保持未勾选；不得把源码搜索记录为 WebClient 纯文本语义完全一致。
