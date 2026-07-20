import { Annotation, AnnotationInput, AnnotationPatch } from './index';
export declare function addAnnotation(filePath: string, paragraphLine: number, input: AnnotationInput): Promise<Annotation>;
export declare function editAnnotation(filePath: string, id: string, patch: AnnotationPatch): Promise<Annotation>;
export declare function writeRawFile(filePath: string, content: string): Promise<void>;
export declare function removeAnnotation(filePath: string, id: string): Promise<void>;
/** 清空文件中全部批注行（围栏外）；返回删除条数。正文经源文件保护校验不变。 */
export declare function clearAllAnnotations(filePath: string): Promise<number>;
//# sourceMappingURL=writer.d.ts.map