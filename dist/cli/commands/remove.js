"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeCommand = removeCommand;
const writer_1 = require("../../core/writer");
async function removeCommand(file, id) {
    try {
        await (0, writer_1.removeAnnotation)(file, id);
    }
    catch (err) {
        process.stderr.write(`错误: ${err.message}\n`);
        process.exit(1);
    }
}
//# sourceMappingURL=remove.js.map