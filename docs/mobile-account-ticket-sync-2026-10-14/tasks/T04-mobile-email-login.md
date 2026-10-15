# T04 移动端原生邮箱验证码登录与官网用户

[返回总览](../README.md) · [改造方案](../DESIGN.md)

状态：**阻塞**。前置：[T00](T00-contract-baseline.md)、[T01](T01-official-email-session.md)。交付：T05。

## 目标

在现有登录页提供原生邮箱验证码方式，以官网接口取得用户信息和可信账号状态；不打开网站、不再要求 Identity 邮箱绑定。

## 工作

1. 复用 LoginScreen/EmailVerificationForm 的实际输入和主题，收敛到邮箱+六位字符串验证码。沿用现有登录方式选择，不新建登录页面或全局表单框架。
2. service 改接官网 start/verify；请求 email/code，不再要求 challengeId/requestId/手机 deviceName；解析 ok/expiresAt/user 和官网 error.code/message。
3. 发送/验证状态、有效期、重发冷却只使用实际接口字段。当前官网没有 resendAvailableAt/serverTime，不伪造服务端字段；本地按钮冷却仅改善交互，服务端429仍是限流权威。
4. 在 accountAuth 复用 bootstrap、订阅、generation、取消和退出，替换 Identity deviceToken 会话模型；成功以 me/官网结果确认，不能仅解析 JWT 宣布登录。
5. 官网 Token 仅允许发往可信官网/Hub origin；Cookie 不发给 Hub，Platform 票据不进入该账号会话。品牌地址来自现有环境制品，不把 Token 放环境文件或硬编码生产域名。
6. 取消、切换邮箱、退出、新登录后的迟到响应必须丢弃；验证码不持久化，凭据和邮箱/验证码日志按既有敏感字段机制脱敏。
7. 用户页显示官网实际资料，不再显示误加的 Identity 绑定状态；不借机新增个人资料编辑、安全中心或密码找回。
8. 默认云端原 Token 登录和独立退出保持不变；合法旧登录入口按 T00 结果处理，不暗中继续向 Identity 登录。

## 验收

- [ ] 邮箱发送、正确/错误/过期验证码、首次官网注册和已有账号登录符合官网语义。
- [ ] 限流、服务故障、取消和迟到结果正确；发送验证码不改变已登录用户。
- [ ] iOS/Android 会话恢复、期限到期重新登录和手机退出真实通过。
- [ ] 无网页登录/扫码/回调，无新账号库、Provider、挑战系统或数据源迁移。
- [ ] 邮箱用户与 Desktop 对应相同 Hub 用户 ID，云端登录回归通过。

## 执行记录

2026-10-15：原生邮箱+六位码表单接官网 Cookie 会话；me 确认用户，官网证明仅内存、退出标记防恢复复活；无 Identity 回退或绑定页。App 742 项测试、lint、types、Web export 通过；真实双平台会话由用户验收，见 [实施记录](../IMPLEMENTATION.md)。


2026-10-15 状态复核：本地实现/检查记录保留，真实环境验收尚未提供，当前等待用户验收证据；不以重复本地测试代替真实结果。
