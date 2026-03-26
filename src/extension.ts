import * as vscode from 'vscode';
import { CoreLinter } from './linter';

const LANGUAGE_ID = 'fusesoc-core';

let diagnosticCollection: vscode.DiagnosticCollection;
const linter = new CoreLinter();

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('fusesoc');
  context.subscriptions.push(diagnosticCollection);

  // Lint any already-open fusesoc documents
  for (const doc of vscode.workspace.textDocuments) {
    lintIfFuseSoC(doc);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(lintIfFuseSoC),
    vscode.workspace.onDidChangeTextDocument(e => lintIfFuseSoC(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri))
  );
}

function lintIfFuseSoC(document: vscode.TextDocument): void {
  if (document.languageId !== LANGUAGE_ID) return;
  if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') return;

  const diagnostics = linter.lint(document);
  diagnosticCollection.set(document.uri, diagnostics);
}

export function deactivate(): void {
  diagnosticCollection?.dispose();
}
