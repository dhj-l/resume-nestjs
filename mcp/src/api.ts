import axios from 'axios';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
}

const baseURL = process.env.SERVER_IP;
const token = process.env.TOKEN;

if (!token) {
  throw new Error('TOKEN is not defined');
}

export const http = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

async function get<T>(url: string): Promise<T> {
  const res = await http.get<ApiResponse<T>>(url);
  const data = res.data;
  if (data.code >= 400) {
    throw new Error(data.message);
  }
  const payload = data?.data;
  return payload;
}

/**
 * 获取当前登录用户的详细信息
 * @param req 请求对象,包含用户信息
 * @returns 当前用户对象
 */
export async function getProfile() {
  return await get<Record<string, unknown>>('/user/profile');
}

/**
 * 获取简历生成记录
 */
export async function getResumeRecords({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}) {
  return await get<Record<string, unknown>>(
    `/resume-ai/records?page=${page}&pageSize=${pageSize}`,
  );
}
