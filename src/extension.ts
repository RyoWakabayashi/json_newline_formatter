import * as vscode from 'vscode';

/**
 * This method is called when the extension is activated
 * The extension is activated the very first time a command is executed
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('JSON Newline Formatter extension is now active');

    // Register the toggle command
    const toggleCommand = vscode.commands.registerCommand('json-newline-formatter.toggle', () => {
        vscode.window.showInformationMessage('JSON Newline Formatter toggle command executed');
        // TODO: Implement toggle functionality in future tasks
    });

    // Add command to subscriptions for proper cleanup
    context.subscriptions.push(toggleCommand);

    // Listen for JSON file activations
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isJsonFile(editor.document)) {
            console.log('JSON file activated:', editor.document.fileName);
            // TODO: Initialize formatting for JSON files in future tasks
        }
    });

    context.subscriptions.push(onDidChangeActiveEditor);

    // Handle already open JSON files
    if (vscode.window.activeTextEditor && isJsonFile(vscode.window.activeTextEditor.document)) {
        console.log('JSON file already open:', vscode.window.activeTextEditor.document.fileName);
        // TODO: Initialize formatting for already open JSON files in future tasks
    }
}

/**
 * This method is called when the extension is deactivated
 */
export function deactivate() {
    console.log('JSON Newline Formatter extension is being deactivated');
    // TODO: Cleanup resources in future tasks
}

/**
 * Helper function to check if a document is a JSON file
 */
function isJsonFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'json' || document.languageId === 'jsonc';
}