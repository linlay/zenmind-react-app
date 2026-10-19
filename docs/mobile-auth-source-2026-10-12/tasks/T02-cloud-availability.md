# T02 验证默认云端业务可用性

[返回总览](../README.md)

状态：**进行中**。前置：[T00](T00-baseline-verification.md)、[T01](T01-cloud-token-credentials.md)。范围：默认云端只读验证和可用性结果。

## 目标

仅在当前凭证完成真实业务验证后允许选择云端，失败给出准确恢复方式。执行遵守[最小架构与执行约束](../README.md#最小架构与执行约束)，不新增健康接口、独立 Socket 池或后台轮询。

## 先读

- [来源 transport](../../../src/core/api/activeWsTransport.ts)
- [共享 transport](../../../src/core/ws/sharedWsTransport.ts)
- [WS 客户端](../../../src/core/ws/wsClient.ts)
- [聊天 transport](../../../src/features/chatRealtime/chatWsTransport.ts)
- [目录刷新与响应校验](../../../src/features/chatRealtime/chatSyncService.ts)

## 最小变更

1. 复用现有目录只读请求及响应校验，使用明确的默认云端 config，不依赖当前所选电脑。验证覆盖现有首页所需目录读取；空目录有效。
2. 探测不写 SQLite/MMKV、不改变来源、不发送消息或创建任务。不得直接调用会投影写库的 refreshHome。
3. 提供足够区分检测中、可用、需登录、无权限及连接/服务/协议失败的结果，复用现有订阅边界；不建立通用状态机。
4. 启动恢复、手动刷新、提交 Token 和断线恢复触发验证。复用既有重连机制，限制超时、取消重复或已过时的验证，不增加持续轮询。
5. Socket onopen 或 sharedWsTransport 的聚合 connected 都不能证明默认云端业务可用；结果必须绑定本次来源、凭证和请求生命周期。
6. 云端不可用时不允许新选择；已选云端断线保留选择及所属缓存，但远端操作不可用。凭证明确失效时转登录引导并隐藏失效凭证所属内容；不把认证失效当作网络离线缓存权限。
7. 结束验证只释放本次拥有的请求、计时器、订阅及闲置连接；不能停止当前电脑或业务复用的共享连接，不能移除其他 feature 监听。

## 验收

- [x] 正常目录和空目录均可用；明确认证失败、权限不足、超时、断网、服务错误和协议异常分别反馈。
- [x] 未选云端的验证不修改业务缓存或来源，不影响正在使用的电脑连接。
- [x] 换 Token、退出或来源生命周期变化后的迟到结果不能重新启用旧云端。
- [x] 反复刷新不产生重复探测、残留计时器或额外连接系统。
- [ ] 真实验证结果与 UI 状态一致；没有只以 mock 或连接事件证明可用。

## 执行记录

- 日期 / 执行者 / 版本：2026-10-12 / Codex / 基线 `64e015bf28bf12c43f50640257f3ab7d402dbb73`，在既有未提交工作区增量实施。
- 实际状态：实现与本地边界验证完成；真实业务验证等待用户执行。
- 实施与证据：cloudAccess 复用 readChatDirectory 的 agents/teams/chats 与 envelope 校验。默认源显式 config 与当前电脑分离；三项全部成功且形态有效才可用，空数组成功。单飞、15 秒超时、取消、generation 防迟到；失败分类认证/权限/网络/服务/协议。sharedWsTransport 按 scoped listener 和 active operation 回收闲置探测连接，待完成请求后释放，不关闭电脑。
- 本地验证：见 [T05](T05-validation-cleanup.md) 最终检查记录；mock/生产导出不代表真实服务或真机通过。
- 真实验收：用户明确由自己测试；默认源当前为 example 占位环境，未部署服务或改变真实配置。
- 清理与保护：任务前记录 HEAD、分支、暂存区/worktree diff 及文件 hash；构建前备份生成目录与 Expo 状态，审计并恢复本次临时产物。原有改动保留，未改 lock/依赖/环境；最终清理证据见 T05。
