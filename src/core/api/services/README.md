# API Services

统一把业务请求接口放在这个目录下。

账号相关接口按实际服务职责划分：`accountEmailApi.ts` 访问 Identity 邮箱与安全摘要；`deviceLinkApi.ts` 只访问 Hub 的 Desktop 目录、管理与连接票据。密码和邮箱登录结果的提交、凭据恢复、刷新和退出仍由 `core/auth/accountAuth.ts` 负责。Identity 的 `deviceId` 表示登录会话，Hub 目录中的 `deviceId` 表示实体 Desktop；不合成两份设备目录。

建议约定：

- 一个业务域一个文件，例如 `chatApi.ts`、`driveApi.ts`
- 每个接口最少包含三部分：
  - 入参类型 `xxxParams`
  - 出参类型 `xxxResponse`
  - 接口函数 `xxxApi`
- 同源接口统一调用 `src/core/api/apiClient.ts` 里的 `apiRequest` / `authenticatedApiRequest`
- Desktop 公网上传只允许由专用 service 访问当前账号路由的规范化 WS 同源 HTTPS Host，并复用该路由的凭证 provider；仅 401 换新凭证重试一次，不向任意外部 origin 转发 token
- 云端 HTTP、WS 和同源资源沿用配置 authMode/accessToken；手机 Identity JWT 仅用于 Identity/Hub，云端 401 不触发 Identity 刷新重试
- 接口函数前写清楚说明、入参、出参

推荐格式见同目录下的 [templateApi.ts](./templateApi.ts)。
