#!/usr/bin/env node
/**
 * MDA MCP Server — stdio 传输，六 tools 与 CLI 语义一致。
 * 工作区：环境变量 MDA_WORKSPACE 或 --workspace <dir>
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  handleMdaAdd,
  handleMdaEdit,
  handleMdaExportReviewPrompt,
  handleMdaReadFile,
  handleMdaRemove,
  handleMdaScan,
} from './handlers';
import { resolveWorkspaceRoot } from './workspace';

const TOOLS = [
  {
    name: 'mda_scan',
    description: '扫描文件或目录中的批注，JSON 输出与 mda-cli scan --format json 一致',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '工作区内文件或目录路径' },
        recursive: { type: 'boolean', description: '目录是否递归扫描' },
        status: { type: 'string', enum: ['open', 'resolved', 'wontfix'] },
        level: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
      },
      required: ['path'],
    },
  },
  {
    name: 'mda_add',
    description: '在指定段落行添加批注',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        line: { type: 'integer', minimum: 1 },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        level: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
        anchor: { type: 'object' },
      },
      required: ['file', 'line', 'content'],
    },
  },
  {
    name: 'mda_edit',
    description: '编辑已有批注',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        id: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        level: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
        status: { type: 'string', enum: ['open', 'resolved', 'wontfix'] },
      },
      required: ['file', 'id'],
    },
  },
  {
    name: 'mda_remove',
    description: '删除批注',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        id: { type: 'string' },
      },
      required: ['file', 'id'],
    },
  },
  {
    name: 'mda_read_file',
    description: '读取 Markdown 文件全文及 parseAnnotations 结果',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
      },
      required: ['file'],
    },
  },
  {
    name: 'mda_export_review_prompt',
    description: '根据多文件批注生成 AI 审阅 prompt',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['files'],
    },
  },
] as const;

function parseWorkspaceFromArgv(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--workspace' && argv[i + 1]) {
      return argv[i + 1];
    }
    if (argv[i].startsWith('--workspace=')) {
      return argv[i].slice('--workspace='.length);
    }
  }
  return undefined;
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

export function createMdaMcpServer(workspace: string): Server {
  const ctx = { workspace };

  const server = new Server(
    { name: 'mda-mcp', version: '2.0.0-alpha' },
    {
      capabilities: { tools: {} },
      instructions:
        'MDA Markdown 工作台 MCP。写操作路径须在工作区内（MDA_WORKSPACE 或 --workspace）。',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case 'mda_scan':
          return await handleMdaScan(ctx, {
            path: String(args.path),
            recursive: args.recursive as boolean | undefined,
            status: args.status as string | undefined,
            level: args.level as string | undefined,
          });
        case 'mda_add':
          return await handleMdaAdd(ctx, {
            file: String(args.file),
            line: Number(args.line),
            content: String(args.content),
            tags: args.tags as string | string[] | undefined,
            level: args.level as string | undefined,
            anchor: args.anchor,
          });
        case 'mda_edit':
          return await handleMdaEdit(ctx, {
            file: String(args.file),
            id: String(args.id),
            content: args.content as string | undefined,
            tags: args.tags as string | string[] | undefined,
            level: args.level as string | undefined,
            status: args.status as string | undefined,
          });
        case 'mda_remove':
          return await handleMdaRemove(ctx, {
            file: String(args.file),
            id: String(args.id),
          });
        case 'mda_read_file':
          return handleMdaReadFile(ctx, { file: String(args.file) });
        case 'mda_export_review_prompt':
          return handleMdaExportReviewPrompt(ctx, {
            files: args.files as string[],
          });
        default:
          return toolError(`未知 tool: ${name}`);
      }
    } catch (e) {
      return toolError((e as Error).message);
    }
  });

  return server;
}

export async function startMdaMcpServer(workspace?: string): Promise<void> {
  const root = resolveWorkspaceRoot(workspace);
  const server = createMdaMcpServer(root);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  const ws = parseWorkspaceFromArgv(process.argv.slice(2));
  startMdaMcpServer(ws).catch((err) => {
    process.stderr.write(`mda-mcp 启动失败: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
