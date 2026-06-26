import { removeAnnotation } from '../../core/writer';

export async function removeCommand(file: string, id: string): Promise<void> {
  try {
    await removeAnnotation(file, id);
  } catch (err) {
    process.stderr.write(`错误: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
