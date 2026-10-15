# T04 App API 与账号会话接入

[返回总览](../README.md)

状态：**已完成**。前置：[T01](T01-contract-readiness.md) 契约；真实联调依赖 [T03](T03-identity-account-api.md)。交付给 [T05](T05-account-security-ui.md)、[T06](T06-email-login-ui.md)。

## 目标与范围

新增明确类型的账号安全 API，邮箱验证码登录进入原 accountAuth 生命周期。接口逻辑只存在一处，页面不能直接 fetch 或持久化凭证。

## 先读入口

- `src/core/auth/accountAuth.ts`、`accountAuthModel.ts`、`src/core/api/accountApiClient.ts`。
- `src/core/api/services/deviceLinkApi.ts`、`src/core/debug/httpDebugLogger.ts`。
- `scripts/tests/accountAuthModel.test.mts`、`accountAuthSession.test.mts`；相关 XGraph auth/API module。

## 必须完成

1. 新增小型 `src/core/api/services/accountEmailApi.ts`，提供查询、发送、绑定、解绑函数及响应校验；复用现有 public/authenticated Account API 请求能力和可信 Identity origin，不引入 axios 或新请求框架。
2. 邮箱验证码登录提交方法放在 accountAuth，复用现有 session 解析、generation、凭证保存与通知。若提取成功会话提交函数，仅覆盖已有实际复用点，不创建 AuthProvider/认证策略体系。
3. 发送邮件不会递增或提交登录会话；真正登录沿用迟到结果保护。退出、切换账号或取消后，响应不得覆盖新账号或重新登录。
4. 账号与安全摘要独立于 AccountSession，无需扩展 token/refresh/storage。页面按需获取；Token 仅发往受信 Identity/Hub，云端凭证不参与账号接口。
5. API 返回结构、邮箱规范化、code 类型、challengeId 与时间字段明确校验。表单保留原输入，小写键仅用于匹配和请求结果比较；不改写用户投递地址、不去掉点号/+tag。服务端摘要返回完整 email，是唯一绑定真源，不保存本地“已绑定”布尔值。
6. 对新请求提供有界超时和外部 AbortSignal，清理计时器和监听。复用现有能力；若现有 client 缺少必要参数，只做局部兼容扩展，不借机统一改造全部网络层。
7. 映射格式、认证、冲突、挑战无效、限流、网络和协议错误供 UI 使用。取消不显示业务失败，邮箱或账号变化后迟到查询不能更新页面。
8. 若请求进入调试日志，补 email/code/otp 脱敏；不输出完整邮箱地址、验证码、deviceToken 或 accessToken。日志修复仅覆盖当前请求需要的字段。

## 防止过度设计

不建第二套会话、Token store、账号资料缓存、全局 Provider、通用挑战状态机或全局表单库。各调用是具名函数，三用途是固定类型；少量相同请求处理复用即可，不让页面传任意 endpoint/policy。默认不新增依赖。

## 验收

- 邮箱验证码登录返回通过原 AccountSession 解析，持久化、刷新、重启恢复与退出行为和密码登录一致。
- 发送验证码不改变会话；取消、退出与新登录能阻止旧结果提交。
- 账号安全失败不会被归类为未绑定；错误有明确可显示分类，敏感日志已脱敏。
- 新请求超时/取消后无残留 timer/listener；固定测试响应验证协议，pnpm typecheck 及相关会话测试通过。
- 云端 Token 与账号凭证仍独立，密码/QR 登录不产生重复通知或重复保存。

## 清理与记录

记录原工作区状态、mock 和配置；只在测试夹具使用假凭证。删除本次重复的解析/保存/请求逻辑及临时输出，保留既有用户改动。记录新增 API 和必要的局部提取，再同步实际 auth/API curated 事实。

## 本次执行记录（2026-10-13）

详见 [实施记录](../IMPLEMENTATION.md)。账号安全 API、响应校验、有界请求、外部取消及会话 generation 接入完成；删除重复 HTTP 解析和三套会话提交片段，API 与原会话测试通过。
