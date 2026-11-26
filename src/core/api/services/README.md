# API Services

统一把业务请求接口放在这个目录下。

账号相关接口按实际服务职责划分：`accountEmailApi.ts` 负责官网验证码发送与登录错误映射；`core/auth/accountAuth.ts` 统一管理品牌账号会话；官网邮箱与企业 SSO 各自完成认证，并共用用户确认、恢复和退出生命周期。`deviceLinkApi.ts` 只访问 Hub 的 Desktop 目录、管理与业务票据；官网证明与 Desktop 原 Identity 业务票据分别传输，不合成两份设备目录。

建议约定：

- 一个业务域一个文件，例如 `chatApi.ts`、`driveApi.ts`
- 每个接口最少包含三部分：
  - 入参类型 `xxxParams`
  - 出参类型 `xxxResponse`
  - 接口函数 `xxxApi`
- 同源接口统一调用 `src/core/api/apiClient.ts` 里的 `apiRequest` / `authenticatedApiRequest`
- Desktop 公网上传只允许由专用 service 访问当前账号路由的规范化 WS 同源 HTTPS Host，并复用该路由的凭证 provider；仅 401 换新凭证重试一次，不向任意外部 origin 转发 token
- 云端 HTTP、WS 和同源资源使用独立 cloudAuth 凭据；官网证明只发送到显式配置的官网/Hub，云端 401 不触发账号刷新重试
- 接口函数前写清楚说明、入参、出参

推荐格式见同目录下的 [templateApi.ts](./templateApi.ts)。


账号登录按安装品牌选择：ZenMind 使用 `accountEmailApi` 与官网邮箱验证码；CuteJ 的统一认证页面由
`EnterpriseLogin` 承载，已确认的企业协议、Cookie 与安全存储在 `core/auth/enterpriseAccount.native.ts`。
两者复用 `accountAuth` 会话管理及 `accountRequest` 请求能力，不提供官网密码或旧登录回退。
`accountRequest.onResponse` 只用于读取已成功响应的状态与响应头，不改变统一的错误、超时和同源约束。

品牌环境 `accountServices` 配置一个认证地址（ZenMind 的 `officialApiBaseUrl` 或 CuteJ 的 `ssoBaseUrl`）
与 `tunnelHubApiBaseUrl`。本仓库 fallback 是未启用账号服务的 example；真实地址由已校验的环境产物提供。

本次增加原生依赖后版本为 1.0.1，以 appVersion runtime 隔离旧壳。用户需手动安装依赖并重建原生包；
真实 iOS/Android 的企业 Cookie、重启恢复、续期、退出及同 Desktop 电脑归属尚需验收。
