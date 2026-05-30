import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getProfile, getResumeRecords } from './api.js';
import * as z from 'zod';
const server = new McpServer({
  name: 'resumeAi-mcp',
  version: '1.0.0',
});

server.registerTool(
  'get-resume-records',
  {
    description: '获取简历生成记录',
    inputSchema: {
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(20).default(10),
    },
  },
  async ({ page, pageSize }) => {
    const records = await getResumeRecords({ page, pageSize });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(records, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  'get-user-info',
  {
    description: '获取当前登录用户的详细信息',
    inputSchema: {},
  },
  async () => {
    const user = await getProfile();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(user, null, 2),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcp已启动');
}
main().catch(() => {
  console.error('mcp启动失败');
  process.exit(1);
});
