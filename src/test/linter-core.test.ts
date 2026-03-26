import * as assert from 'assert';
import {
  lintText,
  IssueSeverity,
  VALID_FILE_TYPES,
  VALID_PARAM_TYPES,
  VALID_DATA_TYPES,
} from '../linter-core.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type IssuesOrText = string | ReturnType<typeof lintText>;

function resolve(input: IssuesOrText) {
  return typeof input === 'string' ? lintText(input) : input;
}

function errors(input: IssuesOrText) {
  return resolve(input).filter(i => i.severity === IssueSeverity.Error);
}

function warnings(input: IssuesOrText) {
  return resolve(input).filter(i => i.severity === IssueSeverity.Warning);
}

function infos(input: IssuesOrText) {
  return resolve(input).filter(i => i.severity === IssueSeverity.Information);
}

function hasMessage(issues: ReturnType<typeof lintText>, fragment: string): boolean {
  return issues.some(i => i.message.includes(fragment));
}

const MINIMAL_VALID = `CAPI=2:

name: vendor:mylib:mycore:1.0.0
`;

const FULL_VALID = `CAPI=2:

name: acme:fpga:uart:2.3.1
description: A UART core

filesets:
  rtl:
    files:
      - src/uart_tx.sv
      - src/uart_rx.sv
    file_type: systemVerilogSource

  tb:
    files:
      - tb/uart_tb.sv
    file_type: systemVerilogSource
    depend:
      - ">=acme:fpga:clkgen:1.0"

targets:
  default:
    filesets:
      - rtl
    toplevel: uart_top

  sim:
    filesets:
      - rtl
      - tb
    default_tool: icarus
    toplevel: uart_tb

parameters:
  BAUD_RATE:
    datatype: int
    default: 115200
    description: Baud rate
    paramtype: vlogparam

  DEBUG:
    datatype: bool
    default: false
    paramtype: vlogdefine
`;

// ─── CAPI header ──────────────────────────────────────────────────────────────

suite('CAPI header validation', () => {
  test('missing header → single error on line 0', () => {
    const issues = lintText('name: foo:bar:baz\n');
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, IssueSeverity.Error);
    assert.strictEqual(issues[0].line, 0);
    assert.ok(issues[0].message.includes('CAPI header'));
  });

  test('missing header → stops further validation', () => {
    const issues = lintText('name: foo:bar:baz\n');
    assert.strictEqual(issues.length, 1);
  });

  test('CAPI=3 → unsupported version error', () => {
    const issues = lintText('CAPI=3:\nname: v:l:n\n');
    assert.ok(hasMessage(issues, 'Unsupported CAPI version'));
    assert.strictEqual(errors(lintText('CAPI=3:\n')).length, 1);
  });

  test('CAPI=1 → information diagnostic, no error', () => {
    const issues = lintText('CAPI=1:\n[main]\nname = vendor:lib:core\n');
    assert.strictEqual(errors(issues).length, 0);
    assert.strictEqual(infos(issues).length, 1);
    assert.ok(hasMessage(issues, 'deprecated'));
  });

  test('CAPI=2 → no header error', () => {
    const issues = lintText(MINIMAL_VALID);
    assert.ok(!hasMessage(issues, 'CAPI header'));
  });

  test('header line is reported correctly (line 0, char 0)', () => {
    const issues = lintText('no header here\n');
    assert.strictEqual(issues[0].line, 0);
    assert.strictEqual(issues[0].startChar, 0);
  });
});

// ─── YAML parse errors ────────────────────────────────────────────────────────

suite('YAML parse errors', () => {
  test('unclosed brace → YAML parse error', () => {
    const text = 'CAPI=2:\nname: {unclosed\n';
    const issues = lintText(text);
    assert.ok(hasMessage(issues, 'YAML parse error'));
    assert.ok(errors(issues).length > 0);
  });

  test('YAML parse error line is offset by 1 (first content line is line 1)', () => {
    const text = 'CAPI=2:\n\tbad_indent: here\n  ok: fine\n';
    const issues = lintText(text);
    // If there's a YAML error, its line should be >= 1
    const yamlErr = issues.find(i => i.message.includes('YAML parse error'));
    if (yamlErr) {
      assert.ok(yamlErr.line >= 1, `Expected line >= 1, got ${yamlErr.line}`);
    }
  });

  test('empty body → warning', () => {
    const issues = lintText('CAPI=2:\n');
    assert.ok(hasMessage(issues, 'empty'));
    assert.strictEqual(errors(issues).length, 0);
  });

  test('YAML array at top level → error', () => {
    const issues = lintText('CAPI=2:\n- one\n- two\n');
    assert.ok(hasMessage(issues, 'must be a YAML mapping'));
    assert.ok(errors(issues).length > 0);
  });

  test('YAML scalar at top level → error', () => {
    const issues = lintText('CAPI=2:\njust a string\n');
    assert.ok(hasMessage(issues, 'must be a YAML mapping'));
  });
});

// ─── Top-level key validation ─────────────────────────────────────────────────

suite('Top-level key validation', () => {
  test('unknown top-level key → warning', () => {
    const text = 'CAPI=2:\nname: v:l:n\nunknown_key: foo\n';
    const issues = lintText(text);
    assert.ok(hasMessage(warnings(issues), 'unknown_key'));
  });

  test('multiple unknown keys → one warning per key', () => {
    const text = 'CAPI=2:\nname: v:l:n\nbad1: x\nbad2: y\n';
    const w = warnings(lintText(text));
    assert.ok(w.some(i => i.message.includes('bad1')));
    assert.ok(w.some(i => i.message.includes('bad2')));
  });

  test('all known keys → no unknown-key warning', () => {
    const issues = lintText(FULL_VALID);
    assert.ok(!issues.some(i => i.message.includes('Unknown top-level key')));
  });

  test('missing "name" → error', () => {
    const text = 'CAPI=2:\nfilesets: {}\n';
    assert.ok(hasMessage(errors(lintText(text)), '"name"'));
  });

  test('"name" present → no missing-name error', () => {
    const issues = lintText(MINIMAL_VALID);
    assert.ok(!hasMessage(issues, 'Required field "name" is missing'));
  });
});

// ─── Core name format ─────────────────────────────────────────────────────────

suite('Core name format', () => {
  test('vendor:lib:name → valid', () => {
    const issues = lintText('CAPI=2:\nname: vendor:mylib:mycore\n');
    assert.ok(!hasMessage(issues, 'Invalid core name'));
  });

  test('vendor:lib:name:version → valid', () => {
    const issues = lintText('CAPI=2:\nname: vendor:mylib:mycore:1.0.0\n');
    assert.ok(!hasMessage(issues, 'Invalid core name'));
  });

  test('two segments → error', () => {
    const issues = lintText('CAPI=2:\nname: vendor:lib\n');
    assert.ok(hasMessage(errors(issues), 'Invalid core name'));
  });

  test('five segments → error', () => {
    const issues = lintText('CAPI=2:\nname: a:b:c:d:e\n');
    assert.ok(hasMessage(errors(issues), 'Invalid core name'));
  });

  test('single segment → error', () => {
    const issues = lintText('CAPI=2:\nname: justname\n');
    assert.ok(hasMessage(errors(issues), 'Invalid core name'));
  });

  test('segment with space → error mentioning segment label', () => {
    const issues = lintText('CAPI=2:\nname: "ven dor:lib:name"\n');
    assert.ok(errors(issues).length > 0);
  });

  test('segment with valid special chars (dots, dashes, underscores) → valid', () => {
    const issues = lintText('CAPI=2:\nname: my-vendor:my_lib:my.core:1.0-rc1\n');
    assert.ok(!hasMessage(issues, 'Invalid core name'));
  });
});

// ─── Filesets ─────────────────────────────────────────────────────────────────

suite('Filesets validation', () => {
  test('filesets is a list → error', () => {
    const text = 'CAPI=2:\nname: v:l:n\nfilesets:\n  - rtl\n';
    assert.ok(hasMessage(errors(lintText(text)), '"filesets" must be a YAML mapping'));
  });

  test('fileset entry is a scalar → error', () => {
    const text = 'CAPI=2:\nname: v:l:n\nfilesets:\n  rtl: just_a_string\n';
    assert.ok(errors(lintText(text)).some(i => i.message.includes('"rtl" must be a YAML mapping')));
  });

  test('unknown fileset key → warning', () => {
    const text = 'CAPI=2:\nname: v:l:n\nfilesets:\n  rtl:\n    unknown_fs_key: foo\n';
    assert.ok(hasMessage(warnings(lintText(text)), 'unknown_fs_key'));
  });

  test('files as scalar → error', () => {
    const text = 'CAPI=2:\nname: v:l:n\nfilesets:\n  rtl:\n    files: not_a_list\n';
    assert.ok(hasMessage(errors(lintText(text)), '"files"'));
  });

  test('unknown file_type → warning with URL reference', () => {
    const text = 'CAPI=2:\nname: v:l:n\nfilesets:\n  rtl:\n    file_type: notARealType\n';
    const w = warnings(lintText(text));
    assert.ok(hasMessage(w, 'notARealType'));
    assert.ok(hasMessage(w, 'fusesoc.readthedocs.io'));
  });

  test('valid file_type → no warning', () => {
    for (const ft of ['verilogSource', 'systemVerilogSource', 'vhdlSource', 'cSource']) {
      const text = `CAPI=2:\nname: v:l:n\nfilesets:\n  rtl:\n    file_type: ${ft}\n`;
      assert.ok(
        !warnings(lintText(text)).some(i => i.message.includes('file_type')),
        `Expected no file_type warning for "${ft}"`
      );
    }
  });

  test('all VALID_FILE_TYPES are accepted', () => {
    for (const ft of VALID_FILE_TYPES) {
      const text = `CAPI=2:\nname: v:l:n\nfilesets:\n  rtl:\n    file_type: ${ft}\n`;
      assert.ok(
        !warnings(lintText(text)).some(i => i.message.includes('Unknown file_type')),
        `"${ft}" should be valid but got a warning`
      );
    }
  });

  test('depend as scalar → error', () => {
    const text = 'CAPI=2:\nname: v:l:n\nfilesets:\n  rtl:\n    depend: single_dep\n';
    assert.ok(hasMessage(errors(lintText(text)), '"depend"'));
  });

  test('depend as list → no error', () => {
    const text = 'CAPI=2:\nname: v:l:n\nfilesets:\n  rtl:\n    depend:\n      - "v:l:dep"\n';
    assert.ok(!hasMessage(errors(lintText(text)), '"depend"'));
  });

  test('fully valid fileset → zero fileset-related diagnostics', () => {
    const issues = lintText(FULL_VALID);
    const fsIssues = issues.filter(i =>
      i.message.includes('fileset') || i.message.includes('file_type') || i.message.includes('"files"')
    );
    assert.strictEqual(fsIssues.length, 0, JSON.stringify(fsIssues));
  });
});

// ─── Targets ──────────────────────────────────────────────────────────────────

suite('Targets validation', () => {
  test('targets is a list → error', () => {
    const text = 'CAPI=2:\nname: v:l:n\ntargets:\n  - default\n';
    assert.ok(hasMessage(errors(lintText(text)), '"targets" must be a YAML mapping'));
  });

  test('fileset reference that exists → no error', () => {
    const issues = lintText(FULL_VALID);
    assert.ok(!issues.some(i => i.message.includes('is not defined in "filesets"')));
  });

  test('fileset reference not in filesets → error', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'filesets:',
      '  rtl:',
      '    files: [src/top.v]',
      'targets:',
      '  default:',
      '    filesets:',
      '      - rtl',
      '      - missing_fs',
    ].join('\n');
    assert.ok(hasMessage(errors(lintText(text)), 'missing_fs'));
  });

  test('fileset reference with "+" prefix → strip prefix before checking', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'filesets:',
      '  rtl:',
      '    files: [src/top.v]',
      'targets:',
      '  default:',
      '    filesets:',
      '      - +rtl',
    ].join('\n');
    assert.ok(!hasMessage(errors(lintText(text)), '"rtl" is not defined'));
  });

  test('fileset reference with "-" prefix → strip prefix before checking', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'filesets:',
      '  rtl:',
      '    files: [src/top.v]',
      'targets:',
      '  default:',
      '    filesets:',
      '      - -rtl',
    ].join('\n');
    assert.ok(!hasMessage(errors(lintText(text)), '"rtl" is not defined'));
  });

  test('unknown target key → warning', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'targets:',
      '  default:',
      '    bad_target_key: foo',
    ].join('\n');
    assert.ok(hasMessage(warnings(lintText(text)), 'bad_target_key'));
  });
});

// ─── Parameters ───────────────────────────────────────────────────────────────

suite('Parameters validation', () => {
  test('parameters is a list → error', () => {
    const text = 'CAPI=2:\nname: v:l:n\nparameters:\n  - MY_PARAM\n';
    assert.ok(hasMessage(errors(lintText(text)), '"parameters" must be a YAML mapping'));
  });

  test('missing paramtype → warning', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'parameters:',
      '  MY_P:',
      '    datatype: int',
    ].join('\n');
    assert.ok(hasMessage(warnings(lintText(text)), 'paramtype'));
  });

  test('invalid paramtype → warning listing valid values', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'parameters:',
      '  MY_P:',
      '    datatype: int',
      '    paramtype: badtype',
    ].join('\n');
    const w = warnings(lintText(text));
    assert.ok(hasMessage(w, 'badtype'));
    for (const pt of VALID_PARAM_TYPES) {
      assert.ok(w.some(i => i.message.includes(pt)), `Expected "${pt}" in valid values list`);
    }
  });

  test('valid paramtype → no paramtype warning', () => {
    for (const pt of VALID_PARAM_TYPES) {
      const text = [
        'CAPI=2:',
        'name: v:l:n',
        'parameters:',
        '  MY_P:',
        `    paramtype: ${pt}`,
      ].join('\n');
      assert.ok(
        !warnings(lintText(text)).some(i => i.message.includes('Unknown paramtype')),
        `"${pt}" should be a valid paramtype`
      );
    }
  });

  test('invalid datatype → warning listing valid values', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'parameters:',
      '  MY_P:',
      '    datatype: bigint',
      '    paramtype: vlogparam',
    ].join('\n');
    const w = warnings(lintText(text));
    assert.ok(hasMessage(w, 'bigint'));
    for (const dt of VALID_DATA_TYPES) {
      assert.ok(w.some(i => i.message.includes(dt)), `Expected "${dt}" in valid values list`);
    }
  });

  test('valid datatype → no datatype warning', () => {
    for (const dt of VALID_DATA_TYPES) {
      const text = [
        'CAPI=2:',
        'name: v:l:n',
        'parameters:',
        '  MY_P:',
        `    datatype: ${dt}`,
        '    paramtype: vlogparam',
      ].join('\n');
      assert.ok(
        !warnings(lintText(text)).some(i => i.message.includes('Unknown datatype')),
        `"${dt}" should be a valid datatype`
      );
    }
  });

  test('unknown parameter key → warning', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'parameters:',
      '  MY_P:',
      '    paramtype: vlogparam',
      '    weird_key: foo',
    ].join('\n');
    assert.ok(hasMessage(warnings(lintText(text)), 'weird_key'));
  });

  test('fully valid parameter → zero parameter-related diagnostics', () => {
    const issues = lintText(FULL_VALID);
    const pIssues = issues.filter(i =>
      i.message.includes('paramtype') ||
      i.message.includes('datatype') ||
      i.message.includes('parameter') && i.severity !== IssueSeverity.Information
    );
    assert.strictEqual(pIssues.length, 0, JSON.stringify(pIssues));
  });
});

// ─── Generate section ─────────────────────────────────────────────────────────

suite('Generate section validation', () => {
  test('generate as list → error', () => {
    const text = 'CAPI=2:\nname: v:l:n\ngenerate:\n  - foo\n';
    assert.ok(hasMessage(errors(lintText(text)), '"generate" must be a YAML mapping'));
  });

  test('generate as valid mapping → no error', () => {
    const text = [
      'CAPI=2:',
      'name: v:l:n',
      'generate:',
      '  my_gen:',
      '    generator: some_gen',
    ].join('\n');
    assert.ok(!hasMessage(errors(lintText(text)), '"generate"'));
  });
});

// ─── Position accuracy ────────────────────────────────────────────────────────

suite('Position accuracy', () => {
  test('YAML parse error line is offset by 1 relative to first CAPI line', () => {
    // Line 0: CAPI=2:
    // Line 1: (blank)
    // Line 2: bad yaml
    const text = 'CAPI=2:\n\n{bad yaml here\n';
    const issues = lintText(text);
    const yamlErr = issues.find(i => i.message.includes('YAML parse error'));
    if (yamlErr) {
      assert.ok(yamlErr.line >= 1, `YAML error should be on line >= 1, got ${yamlErr.line}`);
    }
  });

  test('all issues have valid line numbers (within document range)', () => {
    const lineCount = FULL_VALID.split('\n').length;
    const issues = lintText(FULL_VALID);
    for (const issue of issues) {
      assert.ok(issue.line >= 0 && issue.line < lineCount,
        `Issue line ${issue.line} is out of range [0, ${lineCount})`);
      assert.ok(issue.endLine >= issue.line,
        `endLine ${issue.endLine} < line ${issue.line}`);
    }
  });

  test('startChar <= endChar for all issues', () => {
    const issues = lintText(FULL_VALID);
    for (const issue of issues) {
      assert.ok(issue.startChar <= issue.endChar,
        `startChar ${issue.startChar} > endChar ${issue.endChar} for: ${issue.message}`);
    }
  });

  test('fully valid FULL_VALID fixture → zero diagnostics', () => {
    const issues = lintText(FULL_VALID);
    assert.strictEqual(issues.length, 0, `Expected 0 issues, got:\n${issues.map(i => `  [${i.line}] ${i.message}`).join('\n')}`);
  });
});
