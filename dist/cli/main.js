"use strict";
// CLI 主入口
// 必须将警告/错误输出到 stderr，stdout 仅用于命令结果
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const commander_1 = require("commander");
const scan_1 = require("./commands/scan");
const add_1 = require("./commands/add");
const edit_1 = require("./commands/edit");
const remove_1 = require("./commands/remove");
const program = new commander_1.Command();
program
    .name('mda-cli')
    .description('Markdown 批注管理工具 - CLI')
    .version('1.0.0');
program
    .command('scan <target>')
    .description('扫描文件或目录，列出所有批注')
    .option('-r, --recursive', '递归扫描目录')
    .option('--format <format>', '输出格式: table (默认) 或 json', 'table')
    .option('--status <status>', '按状态筛选: open, resolved, wontfix')
    .option('--level <level>', '按级别筛选: critical, major, minor, info')
    .action(scan_1.scanCommand);
program
    .command('add <file> <line> <content>')
    .description('对指定段落添加批注')
    .option('--tags <tags>', '标签，逗号分隔 (如 "bug,ui")')
    .option('--level <level>', '级别: critical, major, minor, info (默认 info)', 'info')
    .action(add_1.addCommand);
program
    .command('edit <file> <id>')
    .description('编辑已有批注')
    .option('--content <content>', '新批注内容')
    .option('--tags <tags>', '新标签 (逗号分隔，替换而非合并)')
    .option('--level <level>', '新级别: critical, major, minor, info')
    .option('--status <status>', '新状态: open, resolved, wontfix')
    .action(edit_1.editCommand);
program
    .command('remove <file> <id>')
    .description('删除指定批注')
    .action(remove_1.removeCommand);
// 入口：仅在直接运行时解析参数；测试时可传入 args
function run(argv) {
    if (argv !== undefined) {
        program.parse(argv, { from: 'user' });
    }
    else {
        program.parse();
    }
}
run();
//# sourceMappingURL=main.js.map