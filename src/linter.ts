import * as vscode from 'vscode';
import { lintText, IssueSeverity } from './linter-core.js';

const severityMap: Record<IssueSeverity, vscode.DiagnosticSeverity> = {
  [IssueSeverity.Error]:       vscode.DiagnosticSeverity.Error,
  [IssueSeverity.Warning]:     vscode.DiagnosticSeverity.Warning,
  [IssueSeverity.Information]: vscode.DiagnosticSeverity.Information,
  [IssueSeverity.Hint]:        vscode.DiagnosticSeverity.Hint,
};

export class CoreLinter {
  lint(document: vscode.TextDocument): vscode.Diagnostic[] {
    return lintText(document.getText()).map(issue =>
      new vscode.Diagnostic(
        new vscode.Range(issue.line, issue.startChar, issue.endLine, issue.endChar),
        issue.message,
        severityMap[issue.severity],
      )
    );
  }
}
