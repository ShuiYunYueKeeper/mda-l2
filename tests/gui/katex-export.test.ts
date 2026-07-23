// @ts-nocheck
const katexExport = require('../../src/gui/renderer/katex-export.js');

describe('KaTeX article export helpers', () => {
  test('builds a 2x foreignObject payload with logical dimensions', () => {
    const payload = katexExport.buildSvgPayload({
      html: '<span class="katex">x</span>',
      css: '.katex{font-size:16px}',
      width: 120,
      height: 40,
      scale: 2,
      padX: 10,
      padY: 8,
    });

    expect(payload.logicalWidth).toBe(120);
    expect(payload.logicalHeight).toBe(40);
    expect(payload.pixelWidth).toBe(240);
    expect(payload.pixelHeight).toBe(80);
    expect(payload.svg).toContain('viewBox="0 0 120 40"');
    expect(payload.svg).toContain('<foreignObject');
    expect(payload.svg).toContain('<span class="katex">x</span>');
    expect(payload.svg).toContain('white-space:nowrap');
    expect(payload.svg).not.toContain('overflow:hidden');
  });

  test('escapes style closing sequences inside SVG', () => {
    const payload = katexExport.buildSvgPayload({
      html: '<span>x</span>',
      css: '.x{} </style><script>alert(1)</script>',
      width: 40,
      height: 20,
    });

    expect(payload.svg).not.toContain('</style><script>');
    expect(payload.svg).toContain('<\\/style><script>');
  });

  test('keeps only woff2 font sources for Chromium export', () => {
    const css = '@font-face{font-family:K;src:url(fonts/a.woff2) format("woff2"),'
      + 'url(fonts/a.woff) format("woff"),url(fonts/a.ttf) format("truetype")}.katex{color:red}';
    const compact = katexExport.preferWoff2Sources(css);

    expect(compact).toContain('a.woff2');
    expect(compact).not.toContain('a.woff)');
    expect(compact).not.toContain('a.ttf');
    expect(compact).toContain('.katex{color:red}');
  });

  test('uses compact padding for inline formulas', () => {
    expect(katexExport.formulaPadding(false)).toEqual({ x: 4, y: 4 });
    expect(katexExport.formulaPadding(true)).toEqual({ x: 16, y: 12 });
  });

  test('applies measured visual-overflow offsets to the formula wrapper', () => {
    const payload = katexExport.buildSvgPayload({
      html: '<span class="katex">x</span>',
      css: '',
      width: 80,
      height: 30,
      offsetX: -2.5,
      offsetY: 1.5,
    });
    expect(payload.svg).toContain('transform:translate(-2.5px,1.5px)');
  });

  test('encodes unicode SVG as a same-origin-safe base64 data URL', () => {
    const svg = '<svg><text>化学公式 α</text></svg>';
    const dataUrl = katexExport.svgToDataUrl(svg);
    expect(dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(dataUrl.split(',')[1], 'base64').toString('utf8')).toBe(svg);
  });

  test('clamps export scale and invalid dimensions', () => {
    const payload = katexExport.buildSvgPayload({
      width: 0,
      height: -1,
      scale: 99,
    });

    expect(payload.logicalWidth).toBe(1);
    expect(payload.logicalHeight).toBe(1);
    expect(payload.scale).toBe(4);
    expect(payload.pixelWidth).toBe(4);
    expect(payload.pixelHeight).toBe(4);
  });
});
