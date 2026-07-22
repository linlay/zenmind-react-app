# API Services

统一把业务请求接口放在这个目录下。

建议约定：

- 一个业务域一个文件，例如 `chatApi.ts`、`driveApi.ts`
- 每个接口最少包含三部分：
  - 入参类型 `xxxParams`
  - 出参类型 `xxxResponse`
  - 接口函数 `xxxApi`
- 同源接口统一调用 `src/core/api/apiClient.ts` 里的 `apiRequest` / `authenticatedApiRequest`
- Tunnel Hub 文件数据面只允许由专用 service 访问构建期配置的可信 Hub origin，并复用 core/auth token provider；不要给通用 API client 增加任意跨域 token 转发能力
- 接口函数前写清楚说明、入参、出参

推荐格式见同目录下的 [templateApi.ts](./templateApi.ts)。
