import * as fs from 'fs';
import { collectAnnotations } from '../cli/scan-service';
import { addAnnotation, editAnnotation, removeAnnotation } from '../core/writer';
import { parseAnnotations } from '../core/parser';
import {
  ANNOTATION_LEVELS,
  ANNOTATION_STATUSES,
  Annotation,
  AnnotationAnchor,
  AnnotationInput,
  AnnotationPatch,
  isAnnotationLevel,
  isAnnotationStatus,
} from '../core/model';
import { parseAnchor } from '../core/anchor';
import { buildReviewPrompt } from './review-prompt';
import { assertPathExists, resolveWorkspacePath } from './workspace';

export interface McpHandlerContext {
  workspace: string;
}

function jsonText(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function parseTags(tags?: string | string[]): string[] | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  return String(tags).split(',').map(t => t.trim()).filter(Boolean);
}

function parseAnchorArg(anchor: unknown): AnnotationAnchor | undefined {
  if (anchor == null) return undefined;
  const obj = typeof anchor === 'string' ? JSON.parse(anchor) : anchor;
  const parsed = parseAnchor(obj);
  if (!parsed) throw new Error('anchor 字段无效（需要 start/end 且 start < end）');
  return parsed;
}

export async function handleMdaScan(
  ctx: McpHandlerContext,
  args: { path: string; recursive?: boolean; status?: string; level?: string },
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (args.status && !isAnnotationStatus(args.status)) {
    throw new Error(`无效状态 "${args.status}"，可选: ${ANNOTATION_STATUSES.join(', ')}`);
  }
  if (args.level && !isAnnotationLevel(args.level)) {
    throw new Error(`无效级别 "${args.level}"，可选: ${ANNOTATION_LEVELS.join(', ')}`);
  }

  const target = resolveWorkspacePath(ctx.workspace, args.path);
  assertPathExists(target);

  const annotations = collectAnnotations(target, {
    recursive: args.recursive,
    status: args.status,
    level: args.level,
  });

  return jsonText(annotations);
}

export async function handleMdaAdd(
  ctx: McpHandlerContext,
  args: {
    file: string;
    line: number;
    content: string;
    tags?: string | string[];
    level?: string;
    anchor?: unknown;
  },
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lineNum = Number(args.line);
  if (!Number.isInteger(lineNum) || lineNum <= 0) {
    throw new Error(`行号必须为正整数，收到: ${args.line}`);
  }

  const level = args.level ?? 'info';
  if (!isAnnotationLevel(level)) {
    throw new Error(`无效级别 "${level}"，可选: ${ANNOTATION_LEVELS.join(', ')}`);
  }

  const filePath = resolveWorkspacePath(ctx.workspace, args.file);
  assertPathExists(filePath);

  const input: AnnotationInput = {
    content: args.content,
    tags: parseTags(args.tags),
    level,
  };
  const anchor = parseAnchorArg(args.anchor);
  if (anchor) input.anchor = anchor;

  const annotation = await addAnnotation(filePath, lineNum, input);
  return jsonText({ annotation });
}

export async function handleMdaEdit(
  ctx: McpHandlerContext,
  args: {
    file: string;
    id: string;
    content?: string;
    tags?: string | string[];
    level?: string;
    status?: string;
  },
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.content && !args.tags && !args.level && !args.status) {
    throw new Error('至少需要提供一个修改字段: content, tags, level, status');
  }
  if (args.level !== undefined && !isAnnotationLevel(args.level)) {
    throw new Error(`无效级别 "${args.level}"，可选: ${ANNOTATION_LEVELS.join(', ')}`);
  }
  if (args.status !== undefined && !isAnnotationStatus(args.status)) {
    throw new Error(`无效状态 "${args.status}"，可选: ${ANNOTATION_STATUSES.join(', ')}`);
  }

  const filePath = resolveWorkspacePath(ctx.workspace, args.file);
  assertPathExists(filePath);

  const patch: AnnotationPatch = {};
  if (args.content !== undefined) patch.content = args.content;
  if (args.tags !== undefined) patch.tags = parseTags(args.tags);
  if (isAnnotationLevel(args.level)) patch.level = args.level;
  if (isAnnotationStatus(args.status)) patch.status = args.status;

  const annotation = await editAnnotation(filePath, args.id, patch);
  return jsonText({ annotation });
}

export async function handleMdaRemove(
  ctx: McpHandlerContext,
  args: { file: string; id: string },
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const filePath = resolveWorkspacePath(ctx.workspace, args.file);
  assertPathExists(filePath);

  await removeAnnotation(filePath, args.id);
  return jsonText({ ok: true });
}

export function handleMdaReadFile(
  ctx: McpHandlerContext,
  args: { file: string },
): { content: Array<{ type: 'text'; text: string }> } {
  const filePath = resolveWorkspacePath(ctx.workspace, args.file);
  assertPathExists(filePath);

  const content = fs.readFileSync(filePath, 'utf-8');
  const scanResult = parseAnnotations(content);
  return jsonText({ content, scanResult });
}

export function handleMdaExportReviewPrompt(
  ctx: McpHandlerContext,
  args: { files: string[] },
): { content: Array<{ type: 'text'; text: string }> } {
  if (!args.files?.length) {
    throw new Error('files 不能为空');
  }
  for (const f of args.files) {
    const abs = resolveWorkspacePath(ctx.workspace, f);
    assertPathExists(abs);
  }
  const prompt = buildReviewPrompt(ctx.workspace, args.files);
  return jsonText({ prompt });
}

/** 供测试：对齐 CLI JSON 输出 */
export function scanAnnotationsForTest(
  workspace: string,
  targetPath: string,
  opts?: { recursive?: boolean; status?: string; level?: string },
): Annotation[] {
  const abs = resolveWorkspacePath(workspace, targetPath);
  return collectAnnotations(abs, opts);
}
