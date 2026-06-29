import { Annotation, Paragraph, ScanResult } from './model';
declare const ANNO_REGEX: RegExp;
/**
 * 计算围栏代码块遮罩：mask[i] === true 表示第 i 行处于 ```/~~~ 围栏代码块内
 * （含围栏定界行本身）。围栏内的内容是字面文本，不得被识别为批注，也不得在
 * 渲染时被清空。CLI/GUI/渲染共用此判定，保证三处行为一致。
 */
export declare function buildCodeFenceMask(lines: string[]): boolean[];
export declare function parseAnnotations(text: string): ScanResult;
export declare function findAnnotationByLine(annotations: Annotation[], line: number): Annotation | null;
export declare function findParagraphByLine(paragraphs: Paragraph[], line: number): Paragraph | null;
export { ANNO_REGEX };
//# sourceMappingURL=parser.d.ts.map