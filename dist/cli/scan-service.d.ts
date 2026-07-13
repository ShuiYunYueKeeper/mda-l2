import { Annotation } from '../core/model';
export interface ScanCollectOptions {
    recursive?: boolean;
    status?: string;
    level?: string;
}
interface AnnoRow {
    anno: Annotation;
    paragraphText: string;
}
/** 收集批注列表（与 `mda-cli scan --format json` 输出一致） */
export declare function collectAnnotations(target: string, opts?: ScanCollectOptions): Annotation[];
/** 含段落摘要的扫描结果（CLI 表格模式用） */
export declare function collectScanRows(target: string, opts?: ScanCollectOptions): AnnoRow[];
export {};
//# sourceMappingURL=scan-service.d.ts.map