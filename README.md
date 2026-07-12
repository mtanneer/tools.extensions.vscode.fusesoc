# FuseSoC Editor Support

[![CI](https://github.com/mtanneer/tools.extensions.vscode.fusesoc/actions/workflows/ci.yml/badge.svg)](https://github.com/mtanneer/tools.extensions.vscode.fusesoc/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/package-json/v/mtanneer/tools.extensions.vscode.fusesoc)](https://github.com/mtanneer/tools.extensions.vscode.fusesoc/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

VS Code language support for [FuseSoC](https://fusesoc.readthedocs.io/) core description files (`.core`).

## Features

### Syntax Highlighting

- CAPI header (`CAPI=2:`) highlighted distinctly
- Top-level keys (`name`, `filesets`, `targets`, `parameters`, …) emphasized
- File types (`verilogSource`, `systemVerilogSource`, `vhdlSource`, …) colored as constants
- Parameter types (`vlogparam`, `vlogdefine`, `generic`, …) and data types (`int`, `bool`, `str`, …) styled separately
- Tool backends (`icarus`, `vivado`, `quartus`, `nextpnr`, …) highlighted
- Core names (`vendor:library:name:version`) with per-segment coloring
- Full YAML syntax highlighting for everything else

### Linting & Validation

Diagnostics are shown inline as you type:

| Check | Severity |
|---|---|
| Missing or invalid CAPI header | Error |
| YAML parse errors | Error |
| Missing required `name` field | Error |
| Invalid core name format | Error |
| `filesets` / `targets` / `parameters` not a mapping | Error |
| Fileset `files` not a list | Error |
| Unknown fileset referenced in a target | Error |
| Unknown `file_type` value | Warning |
| Unknown `paramtype` / `datatype` value | Warning |
| Missing `paramtype` in a parameter | Warning |
| Unknown keys at any level | Warning |
| CAPI=1 deprecated format | Information |

## Supported Files

| File | Description |
|---|---|
| `*.core` | FuseSoC CAPI2 core description files |
| `fusesoc.conf` | FuseSoC configuration file |

## CAPI2 Quick Reference

```yaml
CAPI=2:

name: vendor:library:core-name:1.0.0
description: "Short description"

filesets:
  rtl:
    files:
      - src/top.sv
    file_type: systemVerilogSource

targets:
  default:
    filesets:
      - rtl
    toplevel: top

parameters:
  MY_PARAM:
    datatype: int
    default: 0
    paramtype: vlogparam
```

## Requirements

No external tools required. The extension works purely from file content.

## Known Limitations

- CAPI=1 (INI-format) files are detected but only receive a deprecation notice.

## Contributing

Issues and pull requests welcome at the project repository.
