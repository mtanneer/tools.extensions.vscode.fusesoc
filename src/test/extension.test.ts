import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('extension activates without throwing', async () => {
    const ext = vscode.extensions.getExtension('Manas-Tanneeru.fusesoc-editor-support');
    assert.ok(ext, 'Extension "Manas-Tanneeru.fusesoc-editor-support" not found. Check publisher in package.json.');
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.ok(ext.isActive);
  });

  test('.core files are recognized as fusesoc-core language', async () => {
    const langs = await vscode.languages.getLanguages();
    assert.ok(langs.includes('fusesoc-core'), '"fusesoc-core" language not registered');
  });
});
