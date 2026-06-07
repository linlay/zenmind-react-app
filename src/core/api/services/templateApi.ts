import { apiRequest } from '../apiClient';

export type GetExampleDetailParams = {
  id: string;
  includeMeta?: boolean;
};

export type GetExampleDetailResponse = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  meta?: {
    authorName?: string;
  };
};

/**
 * 示例接口模板。
 *
 * 描述：
 * 按 ID 获取详情数据，演示统一接口函数的推荐写法。
 *
 * 入参：
 * - `params.id`：必填，资源 ID
 * - `params.includeMeta`：可选，是否返回扩展信息
 *
 * 出参：
 * - 返回 `GetExampleDetailResponse`
 *
 * 使用说明：
 * 1. 把函数名改成真实业务语义，例如 `getChatDetailApi`
 * 2. 把 `path` 改成真实接口路径
 * 3. 根据接口类型选择 `query` 或 `body`
 * 4. 按真实后端结构替换入参和出参类型
 */
export async function getExampleDetailApi(
  params: GetExampleDetailParams
): Promise<GetExampleDetailResponse> {
  return apiRequest<GetExampleDetailResponse>({
    path: '/example/detail',
    method: 'GET',
    query: {
      id: params.id,
      includeMeta: params.includeMeta ? 1 : undefined,
    },
  });
}
