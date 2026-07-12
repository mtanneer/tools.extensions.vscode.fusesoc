// ─── Types ────────────────────────────────────────────────────────────────────

export const enum IssueSeverity {
  Error       = 0,
  Warning     = 1,
  Information = 2,
  Hint        = 3,
}

export interface LintIssue {
  line: number;       // 0-based
  startChar: number;
  endLine: number;    // 0-based (usually same as line)
  endChar: number;
  message: string;
  severity: IssueSeverity;
}

// ─── Valid value sets ──────────────────────────────────────────────────────────

export const VALID_FILE_TYPES = new Set([
  // Verilog
  'verilogSource', 'verilogSource-95', 'verilogSource-2001', 'verilogSource-2005',
  // SystemVerilog
  'systemVerilogSource', 'systemVerilogSource-3.1', 'systemVerilogSource-3.1a',
  'systemVerilogSource-2005', 'systemVerilogSource-2012',
  // VHDL
  'vhdlSource', 'vhdlSource-87', 'vhdlSource-93', 'vhdlSource-2008', 'vhdlSource-2019',
  // C / C++ / SystemC
  'cSource', 'cppSource', 'systemCSource', 'systemCSource-2.2',
  // Constraint / timing
  'xdcFile', 'sdfFile', 'SDC', 'PCF', 'UCF', 'qsf',
  // Xilinx / Intel
  'xciFile', 'QIP', 'IP', 'ngcFile', 'edifFile',
  // Scripts / misc
  'tclFile', 'tclSource', 'pythonSource', 'wavedromFile', 'memorymapFile', 'PSS',
  // Generic
  'user',
]);

export const VALID_PARAM_TYPES = new Set([
  'vlogparam', 'vlogdefine', 'generic', 'cmdlinearg', 'plusarg',
]);

export const VALID_DATA_TYPES = new Set([
  'bool', 'file', 'int', 'str', 'real',
]);

export const KNOWN_TOPLEVEL_KEYS = new Set([
  'name', 'description', 'filesets', 'targets', 'parameters',
  'generate', 'generators', 'provider', 'scripts', 'dependencies', 'virtual', 'packages',
]);

export const KNOWN_FILESET_KEYS = new Set([
  'files', 'file_type', 'logical_name', 'depend', 'include_files',
  'gen_files', 'is_include_file',
]);

export const KNOWN_TARGET_KEYS = new Set([
  'filesets', 'tools', 'toplevel', 'description', 'default_tool',
  'generate', 'parameters', 'vpi', 'hooks',
]);

export const KNOWN_PARAMETER_KEYS = new Set([
  'datatype', 'default', 'description', 'paramtype',
]);

// ─── Position helpers ──────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeIssue(
  lines: string[],
  lineNum: number,
  message: string,
  severity: IssueSeverity
): LintIssue {
  const idx = Math.max(0, Math.min(lineNum, lines.length - 1));
  const text = lines[idx] ?? '';
  const startChar = text.length - text.trimStart().length;
  const endChar = Math.max(startChar + 1, text.trimEnd().length);
  return { line: idx, startChar, endLine: idx, endChar, message, severity };
}

function findKeyLine(lines: string[], key: string, afterLine = 0): number {
  const re = new RegExp(`^(\\s*)${escapeRe(key)}\\s*:`);
  for (let i = afterLine; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  return afterLine;
}

function findValueLine(lines: string[], value: string, afterLine = 0): number {
  const escaped = escapeRe(String(value));
  const patterns = [
    new RegExp(`:\\s*${escaped}\\s*(?:#.*)?$`),
    new RegExp(`^\\s*-\\s*${escaped}\\s*(?:#.*)?$`),
    new RegExp(`\\b${escaped}\\b`),
  ];
  for (let i = afterLine; i < lines.length; i++) {
    for (const re of patterns) {
      if (re.test(lines[i])) return i;
    }
  }
  return afterLine;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface FileExistsChecker {
  (path: string): boolean;
}

export function lintText(text: string, fileExists?: FileExistsChecker, baseDir?: string): LintIssue[] {
  // Lazy-require js-yaml to keep this module importable in plain Node (tests)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yaml = require('js-yaml') as typeof import('js-yaml');

  const issues: LintIssue[] = [];
  const lines = text.split('\n');

  // ── CAPI header ──────────────────────────────────────────────────────────
  const firstLine = lines[0] ?? '';
  const capiMatch = firstLine.match(/^CAPI=(\d+):/);

  if (!capiMatch) {
    issues.push({
      line: 0, startChar: 0, endLine: 0, endChar: Math.max(firstLine.length, 1),
      message: 'FuseSoC core file must begin with a CAPI header, e.g. "CAPI=2:"',
      severity: IssueSeverity.Error,
    });
    return issues;
  }

  const capiVersion = capiMatch[1];
  if (capiVersion !== '1' && capiVersion !== '2') {
    issues.push({
      line: 0, startChar: 0, endLine: 0, endChar: firstLine.length,
      message: `Unsupported CAPI version "${capiVersion}". Only CAPI=1 and CAPI=2 are supported.`,
      severity: IssueSeverity.Error,
    });
    return issues;
  }

  if (capiVersion === '1') {
    issues.push({
      line: 0, startChar: 0, endLine: 0, endChar: firstLine.length,
      message: 'CAPI=1 format is deprecated. Consider migrating to CAPI=2.',
      severity: IssueSeverity.Information,
    });
    return issues;
  }

  // ── YAML parse ───────────────────────────────────────────────────────────
  const yamlContent = lines.slice(1).join('\n');
  let doc: unknown;
  try {
    doc = yaml.load(yamlContent);
  } catch (err: unknown) {
    const e = err as { mark?: { line: number; column: number }; message: string };
    const errLine = (e.mark?.line ?? 0) + 1; // +1: skipped line 0
    const errCol  = e.mark?.column ?? 0;
    issues.push({
      line: errLine, startChar: errCol, endLine: errLine, endChar: errCol + 1,
      message: `YAML parse error: ${e.message}`,
      severity: IssueSeverity.Error,
    });
    return issues;
  }

  if (doc === null || doc === undefined) {
    issues.push(makeIssue(lines, 1, 'Core file body is empty. Expected a YAML mapping.', IssueSeverity.Warning));
    return issues;
  }

  if (typeof doc !== 'object' || Array.isArray(doc)) {
    issues.push(makeIssue(lines, 1,
      'Core file content must be a YAML mapping (key-value pairs), not a sequence or scalar.',
      IssueSeverity.Error));
    return issues;
  }

  lintCAPI2(doc as Record<string, unknown>, lines, issues, fileExists, baseDir);
  return issues;
}

// ─── CAPI2 top-level ──────────────────────────────────────────────────────────

function lintCAPI2(
  doc: Record<string, unknown>,
  lines: string[],
  issues: LintIssue[],
  fileExists?: FileExistsChecker,
  baseDir?: string
): void {
  // Unknown top-level keys
  for (const key of Object.keys(doc)) {
    if (!KNOWN_TOPLEVEL_KEYS.has(key)) {
      const line = findKeyLine(lines, key);
      issues.push(makeIssue(lines, line,
        `Unknown top-level key "${key}". Valid keys: ${[...KNOWN_TOPLEVEL_KEYS].join(', ')}.`,
        IssueSeverity.Warning));
    }
  }

  // Required: name
  if (!('name' in doc) || doc.name === null || doc.name === undefined) {
    issues.push(makeIssue(lines, 1, 'Required field "name" is missing.', IssueSeverity.Error));
  } else {
    lintCoreName(String(doc.name), lines, issues);
  }

  if ('filesets' in doc) {
    lintFilesets(doc.filesets, lines, issues, fileExists, baseDir);
  }

  if ('targets' in doc) {
    const filesets = isStringRecord(doc.filesets) ? doc.filesets : {};
    lintTargets(doc.targets, filesets, lines, issues);
  }

  if ('parameters' in doc) {
    lintParameters(doc.parameters, lines, issues);
  }

  if ('generate' in doc) {
    lintGenerate(doc.generate, lines, issues);
  }
}

// ─── name ─────────────────────────────────────────────────────────────────────

function lintCoreName(name: string, lines: string[], issues: LintIssue[]): void {
  const line = findKeyLine(lines, 'name');
  const parts = name.split(':');

  if (parts.length < 3 || parts.length > 4) {
    issues.push(makeIssue(lines, line,
      `Invalid core name "${name}". Expected: vendor:library:name or vendor:library:name:version`,
      IssueSeverity.Error));
    return;
  }

  const segRe = /^[\w][\w.-]*$/;
  const labels = ['vendor', 'library', 'name', 'version'];
  for (let i = 0; i < parts.length; i++) {
    if (!segRe.test(parts[i])) {
      issues.push(makeIssue(lines, line,
        `Invalid "${labels[i]}" segment "${parts[i]}" in core name. ` +
        'Segments must start with a word character and contain only alphanumerics, dashes, dots, or underscores.',
        IssueSeverity.Error));
    }
  }
}

// ─── filesets ─────────────────────────────────────────────────────────────────

function lintFilesets(
  filesets: unknown,
  lines: string[],
  issues: LintIssue[],
  fileExists?: FileExistsChecker,
  baseDir?: string
): void {
  const fsLine = findKeyLine(lines, 'filesets');
  if (!isStringRecord(filesets)) {
    issues.push(makeIssue(lines, fsLine, '"filesets" must be a YAML mapping.', IssueSeverity.Error));
    return;
  }
  for (const [fsName, fs] of Object.entries(filesets)) {
    const fsStartLine = findKeyLine(lines, fsName, fsLine);
    lintSingleFileset(fsName, fs, lines, fsStartLine, issues, fileExists, baseDir);
  }
}

function lintSingleFileset(
  name: string,
  fs: unknown,
  lines: string[],
  startLine: number,
  issues: LintIssue[],
  fileExists?: FileExistsChecker,
  baseDir?: string
): void {
  if (!isStringRecord(fs)) {
    issues.push(makeIssue(lines, startLine,
      `Fileset "${name}" must be a YAML mapping.`, IssueSeverity.Error));
    return;
  }

  for (const key of Object.keys(fs)) {
    if (!KNOWN_FILESET_KEYS.has(key)) {
      const line = findKeyLine(lines, key, startLine);
      issues.push(makeIssue(lines, line,
        `Unknown fileset key "${key}" in fileset "${name}".`, IssueSeverity.Warning));
    }
  }

  if ('files' in fs && !Array.isArray(fs.files)) {
    const line = findKeyLine(lines, 'files', startLine);
    issues.push(makeIssue(lines, line,
      `"files" in fileset "${name}" must be a list.`, IssueSeverity.Error));
  } else if ('files' in fs && Array.isArray(fs.files) && fileExists && baseDir) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    for (const entry of fs.files) {
      const filePath = typeof entry === 'string' ? entry
        : isStringRecord(entry) && typeof entry.name === 'string' ? entry.name
        : undefined;
      if (!filePath) continue;
      if (!fileExists(path.join(baseDir, filePath))) {
        const line = findValueLine(lines, filePath, startLine);
        issues.push(makeIssue(lines, line,
          `File "${filePath}" in fileset "${name}" does not exist.`, IssueSeverity.Warning));
      }
    }
  }

  if ('file_type' in fs && fs.file_type !== null) {
    const ft = String(fs.file_type);
    if (!VALID_FILE_TYPES.has(ft)) {
      const line = findKeyLine(lines, 'file_type', startLine);
      issues.push(makeIssue(lines, line,
        `Unknown file_type "${ft}" in fileset "${name}". ` +
        'See https://fusesoc.readthedocs.io/en/stable/ref/capi2.html for valid types.',
        IssueSeverity.Warning));
    }
  }

  if ('depend' in fs && !Array.isArray(fs.depend)) {
    const line = findKeyLine(lines, 'depend', startLine);
    issues.push(makeIssue(lines, line,
      `"depend" in fileset "${name}" must be a list.`, IssueSeverity.Error));
  }
}

// ─── targets ──────────────────────────────────────────────────────────────────

function lintTargets(
  targets: unknown,
  filesets: Record<string, unknown>,
  lines: string[],
  issues: LintIssue[]
): void {
  const targetsLine = findKeyLine(lines, 'targets');
  if (!isStringRecord(targets)) {
    issues.push(makeIssue(lines, targetsLine, '"targets" must be a YAML mapping.', IssueSeverity.Error));
    return;
  }
  for (const [targetName, target] of Object.entries(targets)) {
    const targetLine = findKeyLine(lines, targetName, targetsLine);
    lintSingleTarget(targetName, target, filesets, lines, targetLine, issues);
  }
}

function lintSingleTarget(
  name: string,
  target: unknown,
  filesets: Record<string, unknown>,
  lines: string[],
  startLine: number,
  issues: LintIssue[]
): void {
  if (!isStringRecord(target)) return;

  for (const key of Object.keys(target)) {
    if (!KNOWN_TARGET_KEYS.has(key)) {
      const line = findKeyLine(lines, key, startLine);
      issues.push(makeIssue(lines, line,
        `Unknown target key "${key}" in target "${name}".`, IssueSeverity.Warning));
    }
  }

  if ('filesets' in target && Array.isArray(target.filesets)) {
    const knownFilesets = Object.keys(filesets);
    if (knownFilesets.length > 0) {
      for (const ref of target.filesets) {
        const fsName = String(ref).replace(/^[+-]/, '');
        if (!(fsName in filesets)) {
          const line = findValueLine(lines, ref, startLine);
          issues.push(makeIssue(lines, line,
            `Fileset "${fsName}" referenced in target "${name}" is not defined in "filesets".`,
            IssueSeverity.Error));
        }
      }
    }
  }
}

// ─── parameters ───────────────────────────────────────────────────────────────

function lintParameters(
  parameters: unknown,
  lines: string[],
  issues: LintIssue[]
): void {
  const paramLine = findKeyLine(lines, 'parameters');
  if (!isStringRecord(parameters)) {
    issues.push(makeIssue(lines, paramLine, '"parameters" must be a YAML mapping.', IssueSeverity.Error));
    return;
  }
  for (const [paramName, param] of Object.entries(parameters)) {
    const pLine = findKeyLine(lines, paramName, paramLine);
    lintSingleParameter(paramName, param, lines, pLine, issues);
  }
}

function lintSingleParameter(
  name: string,
  param: unknown,
  lines: string[],
  startLine: number,
  issues: LintIssue[]
): void {
  if (!isStringRecord(param)) return;

  for (const key of Object.keys(param)) {
    if (!KNOWN_PARAMETER_KEYS.has(key)) {
      const line = findKeyLine(lines, key, startLine);
      issues.push(makeIssue(lines, line,
        `Unknown parameter key "${key}" in parameter "${name}".`, IssueSeverity.Warning));
    }
  }

  if (!('paramtype' in param)) {
    issues.push(makeIssue(lines, startLine,
      `Parameter "${name}" is missing required field "paramtype".`, IssueSeverity.Warning));
  } else if (param.paramtype !== null) {
    const pt = String(param.paramtype);
    if (!VALID_PARAM_TYPES.has(pt)) {
      const line = findKeyLine(lines, 'paramtype', startLine);
      issues.push(makeIssue(lines, line,
        `Unknown paramtype "${pt}" in parameter "${name}". Valid values: ${[...VALID_PARAM_TYPES].join(', ')}.`,
        IssueSeverity.Warning));
    }
  }

  if ('datatype' in param && param.datatype !== null) {
    const dt = String(param.datatype);
    if (!VALID_DATA_TYPES.has(dt)) {
      const line = findKeyLine(lines, 'datatype', startLine);
      issues.push(makeIssue(lines, line,
        `Unknown datatype "${dt}" in parameter "${name}". Valid values: ${[...VALID_DATA_TYPES].join(', ')}.`,
        IssueSeverity.Warning));
    }
  }
}

// ─── generate ─────────────────────────────────────────────────────────────────

function lintGenerate(generate: unknown, lines: string[], issues: LintIssue[]): void {
  const genLine = findKeyLine(lines, 'generate');
  if (!isStringRecord(generate)) {
    issues.push(makeIssue(lines, genLine, '"generate" must be a YAML mapping.', IssueSeverity.Error));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStringRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}
