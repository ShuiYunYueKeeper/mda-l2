import schema from '../../src/config/annotation-schema.json';
import {
  ANNOTATION_LEVELS,
  ANNOTATION_STATUSES,
  isAnnotationLevel,
  isAnnotationStatus,
} from '../../src/core/model';
import { LEVEL_COLORS, LEVEL_SEVERITY } from '../../src/core/renderer';

describe('外置规则配置驱动 core', () => {
  test('枚举来源于 annotation-schema.json', () => {
    expect(ANNOTATION_LEVELS).toEqual(schema.levels);
    expect(ANNOTATION_STATUSES).toEqual(schema.statuses);
  });

  test('级别配色 / 严重度来源于配置', () => {
    expect(LEVEL_COLORS).toEqual(schema.levelColors);
    expect(LEVEL_SEVERITY).toEqual(schema.levelSeverity);
  });

  test('枚举守卫与配置一致', () => {
    for (const l of schema.levels) expect(isAnnotationLevel(l)).toBe(true);
    for (const s of schema.statuses) expect(isAnnotationStatus(s)).toBe(true);
    expect(isAnnotationLevel('nope')).toBe(false);
    expect(isAnnotationStatus('nope')).toBe(false);
  });

  test('批注正则可匹配标准批注行', () => {
    const re = new RegExp(schema.annotationPattern);
    const line =
      '[comment]: <> (@anno {"id":"x","content":"c","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00Z"})';
    expect(re.test(line)).toBe(true);
    expect(re.test('普通正文')).toBe(false);
  });
});
