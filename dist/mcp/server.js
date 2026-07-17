#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMdaMcpServer = createMdaMcpServer;
exports.startMdaMcpServer = startMdaMcpServer;
/**
 * MDA MCP Server — stdio 传输，六 tools 与 CLI 语义一致。
 * 工作区：环境变量 MDA_WORKSPACE 或 --workspace <dir>
 */
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const handlers_1 = require("./handlers");
const workspace_1 = require("./workspace");
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
];
function parseWorkspaceFromArgv(argv) {
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
function toolError(message) {
    return { content: [{ type: 'text', text: message }], isError: true };
}
function createMdaMcpServer(workspace) {
    const ctx = { workspace };
    const server = new index_js_1.Server({ name: 'mda-mcp', version: '2.0.0-alpha' }, {
        capabilities: { tools: {} },
        instructions: 'MDA Markdown 工作台 MCP。写操作路径须在工作区内（MDA_WORKSPACE 或 --workspace）。',
    });
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
        tools: TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        })),
    }));
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const name = request.params.name;
        const args = (request.params.arguments ?? {});
        try {
            switch (name) {
                case 'mda_scan':
                    return await (0, handlers_1.handleMdaScan)(ctx, {
                        path: String(args.path),
                        recursive: args.recursive,
                        status: args.status,
                        level: args.level,
                    });
                case 'mda_add':
                    return await (0, handlers_1.handleMdaAdd)(ctx, {
                        file: String(args.file),
                        line: Number(args.line),
                        content: String(args.content),
                        tags: args.tags,
                        level: args.level,
                        anchor: args.anchor,
                    });
                case 'mda_edit':
                    return await (0, handlers_1.handleMdaEdit)(ctx, {
                        file: String(args.file),
                        id: String(args.id),
                        content: args.content,
                        tags: args.tags,
                        level: args.level,
                        status: args.status,
                    });
                case 'mda_remove':
                    return await (0, handlers_1.handleMdaRemove)(ctx, {
                        file: String(args.file),
                        id: String(args.id),
                    });
                case 'mda_read_file':
                    return (0, handlers_1.handleMdaReadFile)(ctx, { file: String(args.file) });
                case 'mda_export_review_prompt':
                    return (0, handlers_1.handleMdaExportReviewPrompt)(ctx, {
                        files: args.files,
                    });
                default:
                    return toolError(`未知 tool: ${name}`);
            }
        }
        catch (e) {
            return toolError(e.message);
        }
    });
    return server;
}
async function startMdaMcpServer(workspace) {
    const root = (0, workspace_1.resolveWorkspaceRoot)(workspace);
    const server = createMdaMcpServer(root);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
if (require.main === module) {
    const ws = parseWorkspaceFromArgv(process.argv.slice(2));
    startMdaMcpServer(ws).catch((err) => {
        process.stderr.write(`mda-mcp 启动失败: ${err.message}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map