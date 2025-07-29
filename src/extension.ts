import * as vscode from 'vscode';
import { DecorationManager } from './decorationManager';
import { EditSynchronizer } from './editSynchronizer';
import { SearchHandler } from './searchHandler';
import { JsonFeatureIntegration } from './jsonFeatureIntegration';

// Global instances
let decorationManager: DecorationManager;
let editSynchronizer: EditSynchronizer;
let searchHandler: SearchHandler;
let jsonFeatureIntegration: JsonFeatureIntegration;

/**
 * This method is called when the extension is activated
 * The extension is activated the very first time a command is executed
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('JSON Newline Formatter extension is now active');

    // Initialize core components
    decorationManager = new DecorationManager();
    editSynchronizer = new EditSynchronizer(decorationManager);
    searchHandler = new SearchHandler(decorationManager, editSynchronizer);
    jsonFeatureIntegration = new JsonFeatureIntegration(decorationManager);

    // Register the toggle command
    const toggleCommand = vscode.commands.registerCommand('json-newline-formatter.toggle', () => {
        const isEnabled = decorationManager.isDecorationEnabled();
        decorationManager.setEnabled(!isEnabled);
        
        const status = isEnabled ? 'disabled' : 'enabled';
        vscode.window.showInformationMessage(`JSON Newline Formatter ${status}`);
    });

    // Add command to subscriptions for proper cleanup
    context.subscriptions.push(toggleCommand);

    // Listen for JSON file activations
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isJsonFile(editor.document)) {
            console.log('JSON file activated:', editor.document.fileName);
            // Apply decorations to the newly activated JSON file
            decorationManager.applyDecorations(editor.document);
        }
    });

    context.subscriptions.push(onDidChangeActiveEditor);

    // Handle already open JSON files
    if (vscode.window.activeTextEditor && isJsonFile(vscode.window.activeTextEditor.document)) {
        console.log('JSON file already open:', vscode.window.activeTextEditor.document.fileName);
        // Apply decorations to already open JSON files
        decorationManager.applyDecorations(vscode.window.activeTextEditor.document);
    }

    // Register clipboard commands for enhanced copy/paste behavior
    editSynchronizer.registerClipboardCommands(context);

    // Add components to subscriptions for proper cleanup
    context.subscriptions.push(decorationManager);
    context.subscriptions.push(editSynchronizer);
    context.subscriptions.push(searchHandler);
    context.subscriptions.push(jsonFeatureIntegration);
}

/**
 * This method is called when the extension is deactivated
 */
export function deactivate() {
    console.log('JSON Newline Formatter extension is being deactivated');
    
    // Cleanup resources
    if (decorationManager) {
        decorationManager.dispose();
    }
    if (editSynchronizer) {
        editSynchronizer.dispose();
    }
    if (searchHandler) {
        searchHandler.dispose();
    }
    if (jsonFeatureIntegration) {
        jsonFeatureIntegration.dispose();
    }
}

/**
 * Helper function to check if a document is a JSON file
 */
function isJsonFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'json' || document.languageId === 'jsonc';
}