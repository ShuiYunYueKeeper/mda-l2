import { Annotation } from '../core/model';
export interface McpHandlerContext {
    workspace: string;
}
export declare function handleMdaScan(ctx: McpHandlerContext, args: {
    path: string;
    recursive?: boolean;
    status?: string;
    level?: string;
}): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleMdaAdd(ctx: McpHandlerContext, args: {
    file: string;
    line: number;
    content: string;
    tags?: string | string[];
    level?: string;
    anchor?: unknown;
}): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleMdaEdit(ctx: McpHandlerContext, args: {
    file: string;
    id: string;
    content?: string;
    tags?: string | string[];
    level?: string;
    status?: string;
}): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleMdaRemove(ctx: McpHandlerContext, args: {
    file: string;
    id: string;
}): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleMdaReadFile(ctx: McpHandlerContext, args: {
    file: string;
}): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
export declare function handleMdaExportReviewPrompt(ctx: McpHandlerContext, args: {
    files: string[];
}): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
/** 供测试：对齐 CLI JSON 输出 */
export declare function scanAnnotationsForTest(workspace: string, targetPath: string, opts?: {
    recursive?: boolean;
    status?: string;
    level?: string;
}): Annotation[];
//# sourceMappingURL=handlers.d.ts.map