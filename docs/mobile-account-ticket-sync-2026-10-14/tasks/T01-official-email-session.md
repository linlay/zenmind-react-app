# T01 复用官网邮箱认证与已有会话

[返回总览](../README.md) · [改造方案](../DESIGN.md)

状态：**阻塞**。前置：[T00](T00-contract-baseline.md)。交付：[T04](T04-mobile-email-login.md)。

## 目标与范围

让原生手机使用已有邮箱验证码服务获取官网用户与可供 Hub 验证的认证结果。主要工作是已有接口接入，只有经 T00 证明缺失的承接能力才修改 official-server。

## 工作

1. 沿用 email-code/start `{email}` 和 verify `{email, code}`，不建立 Identity challenge、不增加第二份验证码表或发送器。
2. 沿用官网验证码消费、注册/身份关联、限流、账号启停及错误码；手机不实现不同注册政策。
3. 复用 Cookie 会话、me、csrf、已有 SSO JWT 获取和 logout；不改变 Desktop 或官网浏览器现有响应。官网 JWT 仅是 Hub 用户证明，不能当作 Platform 票据。
4. 确认由既有 JWT signer 与 Hub 已配置信任完成验证，不要求手机身份包含 Identity account_id/device_id，不新增手机会话 UUID。
5. Cookie 无法承接已确认需求时，只对已有请求层/会话接口作最小适配并更新本记录。缺少真机证据不能触发建设新认证体系；期限到期要求用户重新邮箱登录即可。
6. CuteJ 使用 T00 核实的原品牌接口；差异只放品牌已有配置及具名适配，不能创建通用可插拔认证 Provider。
7. 新增真实差异对应的行为测试；已有能力完全可复用时提交验证记录即可，不为任务编号制造代码修改。

## 验收

- [ ] 原生发送/验证、用户读取、JWT 获取、恢复/到期与退出闭环成立。
- [ ] 错误验证码、限流、禁用账号不会提交成功会话。
- [ ] 原 Desktop 登录和官网 Cookie/CSRF 行为不变。
- [ ] official-website 无修改；无重复 OTP、SMTP、账号库或刷新平台。
- [ ] 有后端必要测试及真实接口证据，临时状态已清理。

## 执行记录

2026-10-15：官网服务和网站均未改动；复用既有 email-code/start、verify、me、csrf、desktop-sso/token、logout。App 原生请求按真实收据与 error.code/message 接入。官网真实发送/注册/Cookie 由用户验收；本地 service/session 测试见 [实施记录](../IMPLEMENTATION.md)。


2026-10-15 状态复核：本地实现/检查记录保留，真实环境验收尚未提供，当前等待用户验收证据；不以重复本地测试代替真实结果。
