import { Annotation, AnnotationInput, AnnotationPatch } from './index';
export declare function addAnnotation(filePath: string, paragraphLine: number, input: AnnotationInput): Promise<Annotation>;
export declare function editAnnotation(filePath: string, id: string, patch: AnnotationPatch): Promise<Annotation>;
export declare function writeRawFile(filePath: string, content: string): Promise<void>;
export declare function removeAnnotation(filePath: string, id: string): Promise<void>;
//# sourceMappingURL=writer.d.ts.map