/**
 * M8-C4：围栏代码块可选语言（与竞品列表一致；id 为围栏 info 串 / hljs 语言名）。
 */
'use strict';

/** @type {{ id: string, label: string }[]} */
const CODE_BLOCK_LANGUAGES = [
  { id: '', label: 'Plain Text' },
  { id: 'bash', label: 'Bash' },
  { id: 'csharp', label: 'C#' },
  { id: 'cpp', label: 'C/C++' },
  { id: 'cmake', label: 'CMake' },
  { id: 'css', label: 'CSS' },
  { id: 'dart', label: 'Dart' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'erlang', label: 'Erlang' },
  { id: 'fortran', label: 'Fortran' },
  { id: 'go', label: 'Go' },
  { id: 'groovy', label: 'Groovy' },
  { id: 'haskell', label: 'Haskell' },
  { id: 'http', label: 'HTTP' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'julia', label: 'Julia' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'latex', label: 'LaTeX' },
  { id: 'less', label: 'Less' },
  { id: 'lisp', label: 'Lisp' },
  { id: 'lua', label: 'Lua' },
  { id: 'makefile', label: 'Makefile' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'matlab', label: 'MATLAB' },
  { id: 'nginx', label: 'Nginx' },
  { id: 'objectivec', label: 'Objective-C' },
  { id: 'perl', label: 'Perl' },
  { id: 'php', label: 'PHP' },
  { id: 'python', label: 'Python' },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'scala', label: 'Scala' },
  { id: 'scheme', label: 'Scheme' },
  { id: 'scss', label: 'SCSS' },
  { id: 'shell', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'tcl', label: 'Tcl' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'verilog', label: 'Verilog/SystemVerilog' },
  { id: 'xml', label: 'XML/HTML' },
  { id: 'yaml', label: 'YAML' },
];

/** @type {Record<string, string>} */
const LANG_ALIASES = {
  'c++': 'cpp',
  c: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  html: 'xml',
  htm: 'xml',
  objc: 'objectivec',
  'objective-c': 'objectivec',
  md: 'markdown',
  docker: 'dockerfile',
  systemverilog: 'verilog',
  sv: 'verilog',
  plaintext: '',
  text: '',
  plain: '',
};

/**
 * @param {string} [lang]
 */
function normalizeCodeBlockLang(lang) {
  const raw = String(lang || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LANG_ALIASES, lower)) {
    return LANG_ALIASES[lower];
  }
  const hit = CODE_BLOCK_LANGUAGES.find(function (item) {
    return item.id.toLowerCase() === lower;
  });
  return hit ? hit.id : lower;
}

/**
 * @param {string} [lang]
 */
function findCodeLanguage(lang) {
  const id = normalizeCodeBlockLang(lang);
  const hit = CODE_BLOCK_LANGUAGES.find(function (item) {
    return item.id === id;
  });
  if (hit) return hit;
  if (!id) return CODE_BLOCK_LANGUAGES[0];
  return { id: id, label: id };
}

/**
 * @param {string} [lang]
 * @param {(key: string) => string} [t]
 */
function getCodeLangLabel(lang, t) {
  const item = findCodeLanguage(lang);
  if (!item.id && typeof t === 'function') return t('widgetCodeLangPlain');
  if (!item.id) return 'Plain Text';
  return item.label;
}

/**
 * @param {string} query
 */
function filterCodeLanguages(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return CODE_BLOCK_LANGUAGES.slice();
  return CODE_BLOCK_LANGUAGES.filter(function (item) {
    return (
      item.label.toLowerCase().indexOf(q) >= 0 ||
      item.id.toLowerCase().indexOf(q) >= 0
    );
  });
}

module.exports = {
  CODE_BLOCK_LANGUAGES: CODE_BLOCK_LANGUAGES,
  normalizeCodeBlockLang: normalizeCodeBlockLang,
  findCodeLanguage: findCodeLanguage,
  getCodeLangLabel: getCodeLangLabel,
  filterCodeLanguages: filterCodeLanguages,
};
