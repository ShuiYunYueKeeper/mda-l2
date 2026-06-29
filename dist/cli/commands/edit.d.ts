interface EditOptions {
    content?: string;
    tags?: string;
    level?: string;
    status?: string;
}
export declare function editCommand(file: string, id: string, opts: EditOptions): Promise<void>;
export {};
//# sourceMappingURL=edit.d.ts.map