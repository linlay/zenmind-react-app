# T01 统一默认云端 Token 与请求凭证

[返回总览](../README.md)

状态：**已完成**。前置：[T00](T00-baseline-verification.md)。范围：移动端凭证与请求入口。

## 目标

默认云端独立使用自己的凭证，账号会话继续服务账号电脑。复用现有 API 和 transport，禁止新增第二套请求框架。执行遵守[最小架构与执行约束](../README.md#最小架构与执行约束)。

## 先读

- [账号认证](../../../src/core/auth/accountAuth.ts)
- [来源 transport](../../../src/core/api/activeWsTransport.ts)
- [HTTP 请求](../../../src/core/api/apiClient.ts)
- [账号请求](../../../src/core/api/accountApiClient.ts)
- [资源](../../../src/core/api/services/authenticatedResource.ts)
- [上传](../../../src/core/api/services/uploadApi.ts)
- [导出](../../../src/core/api/services/chatExport.ts)
- [现有凭证测试](../../../scripts/tests/cloudApiCredential.test.mts)

## 最小变更

1. 在既有 core 认证边界补齐默认云端凭证的读取、保存、失效与订阅；只管理默认源，不扩展多云端 Profile、账号系统或通用凭证管理器。
2. 首次没有保存凭证且未主动退出时尝试配置凭证。用户手动 Token 验证成功后保存，按默认源地址/身份绑定；恢复使用最后确认凭证，不把凭证发往任意用户输入地址。
3. 手动 Token 明确认证失效时引导重登，不静默回退配置 Token；网络故障保留凭证。主动退出云端后不自动重新使用配置凭证，必须由用户主动登录。
4. 云端 HTTP、WS、资源、上传、导出共用该入口，移除导出等残留 Identity Token 读取。已有特殊接口或不支持能力按 T00 事实处理，不补建服务端协议。
5. 账号 Token 继续只发送到受信 Identity / Hub；电脑继续使用账号路由票据。云端认证失败不触发 Identity 刷新重试，也不使用电脑凭证回退。
6. 默认云端凭证变更使对应迟到请求失效；账号登录/退出不能单独使仍有效的云端请求和凭证失效。接入现有来源生命周期，不另造控制器体系。
7. 保存只在既有合适的原生凭证入口完成；不把完整 Token 写日志、业务 ID、数据库名或 Web localStorage，不引入自制加密逻辑。

## 验收

- [x] 没有 Identity 会话也能解析和使用有效默认云端凭证。
- [x] 手动 Token 保存、验证恢复、明确失效、网络故障和主动退出符合总览。
- [x] 所有实际支持的云端数据面使用同一凭证入口，无 Identity/电脑 Token 回退。
- [x] 两种退出互不影响；换 Token 的迟到请求失效，无跨地址凭证转发。
- [x] 使用现有测试入口验证凭证选择、失败和迟到响应边界；真实可用性由 T02/T05 验收。

## 执行记录

- 日期 / 执行者 / 版本：2026-10-12 / Codex / 基线 `64e015bf28bf12c43f50640257f3ab7d402dbb73`，在既有未提交工作区增量实施。
- 实际状态：默认云端凭证、请求统一入口及本地行为验证完成。
- 实施与证据：新增 `src/core/auth/cloudAuth.ts`（存储、固定来源绑定、scope、generation）及小型订阅 hook。HTTP/WS、资源、上传、导出和 Office 统一当前云端凭证；账号仅负责 Identity/Hub 和电脑路由。验证成功才保存，手动凭证失效不回退配置，网络错误保留，退出抑制配置恢复，Web 不持久化 Token。删除旧云端账号门禁与导出/Office Identity 读取。
- 本地验证：见 [T05](T05-validation-cleanup.md) 最终检查记录；mock/生产导出不代表真实服务或真机通过。
- 真实验收：用户明确由自己测试；默认源当前为 example 占位环境，未部署服务或改变真实配置。
- 清理与保护：任务前记录 HEAD、分支、暂存区/worktree diff 及文件 hash；构建前备份生成目录与 Expo 状态，审计并恢复本次临时产物。原有改动保留，未改 lock/依赖/环境；最终清理证据见 T05。
