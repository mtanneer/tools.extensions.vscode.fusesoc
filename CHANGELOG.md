# Changelog

## [0.3.0] - 2026-03-26

### Fixed
- Syntax highlighting for top-level keys (`filesets`, `targets`, etc.) was not working due to FuseSoC-specific patterns being defined in an injection grammar that never fired within the embedded YAML context. All patterns are now defined directly in the main grammar.

### Added
- Second-level keys (fileset names, target names, parameter names, etc.) are now highlighted with a distinct color (`entity.name.section.fusesoc`)

## [0.2.1] - 2026-03-26
- Updated Changelog for 0.2.0
## [0.2.0] - 2026-03-26

### Added
- `packages` top-level key is now highlighted and recognized by the linter

## [0.1.0] - 2026-03-26

### Added
- Syntax highlighting for `.core` files (CAPI2 format)
- CAPI header detection and highlighting
- TextMate grammar with YAML base and FuseSoC-specific injection grammar
- Highlighting for file types, parameter types, data types, tool backends, core names
- Full CAPI2 linting: name format, fileset/target/parameter validation
- Unknown key warnings at all nesting levels
- Fileset cross-reference validation in targets
- CAPI=1 deprecation notice
