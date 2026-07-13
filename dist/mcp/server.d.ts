#!/usr/bin/env node
/**
 * MDA MCP Server — stdio 传输，六 tools 与 CLI 语义一致。
 * 工作区：环境变量 MDA_WORKSPACE 或 --workspace <dir>
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export declare function createMdaMcpServer(workspace: string): Server;
export declare function startMdaMcpServer(workspace?: string): Promise<void>;
//# sourceMappingURL=server.d.ts.map