// CLI 主入口
// 必须将警告/错误输出到 stderr，stdout 仅用于命令结果

import { Command } from 'commander';
import { scanCommand } from './commands/scan';
import { addCommand } from './commands/add';
import { editCommand } from './commands/edit';
import { removeCommand } from './commands/remove';

const program = new Command();

program
  .name('mda-cli')
  .description('MDA Markdown 工作台 - CLI')
  .version('1.0.0');

program
  .command('scan <target>')
  .description('扫描文件或目录，列出所有批注')
  .option('-r, --recursive', '递归扫描目录')
  .option('--format <format>', '输出格式: table (默认) 或 json', 'table')
  .option('--status <status>', '按状态筛选: open, resolved, wontfix')
  .option('--level <level>', '按级别筛选: critical, major, minor, info')
  .action(scanCommand);

program
  .command('add <file> <line> <content>')
  .description('对指定段落添加批注')
  .option('--tags <tags>', '标签，逗号分隔 (如 "bug,ui")')
  .option('--level <level>', '级别: critical, major, minor, info (默认 info)', 'info')
  .option('--anchor <json>', '选区锚点 JSON，如 \'{"start":10,"end":20}\'')
  .action(addCommand);

program
  .command('edit <file> <id>')
  .description('编辑已有批注')
  .option('--content <content>', '新批注内容')
  .option('--tags <tags>', '新标签 (逗号分隔，替换而非合并)')
  .option('--level <level>', '新级别: critical, major, minor, info')
  .option('--status <status>', '新状态: open, resolved, wontfix')
  .action(editCommand);

program
  .command('remove <file> <id>')
  .description('删除指定批注')
  .action(removeCommand);

// 入口：仅在直接运行时解析参数；测试时可传入 args
export function run(argv?: string[]) {
  if (argv !== undefined) {
    program.parse(argv, { from: 'user' });
  } else {
    program.parse();
  }
}

run();
