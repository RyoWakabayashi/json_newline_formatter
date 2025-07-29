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
let statusBarItem: vscode.StatusBarItem;

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

    // Create status bar item
    statusBarItem = createStatusBarItem();
    
    // Register the toggle command
    const toggleCommand = vscode.commands.registerCommand('json-newline-formatter.toggle', () => {
        const wasEnabled = decorationManager.isDecorationEnabled();
        const newState = !wasEnabled;
        
        decorationManager.setEnabled(newState);
        updateStatusBarItem(newState);
        
        const status = newState ? 'enabled' : 'disabled';
        const message = `JSON Newline Formatting ${status}`;
        
        // Show user feedback with appropriate icon
        if (newState) {
            vscode.window.showInformationMessage(`✅ ${message}`);
        } else {
            vscode.window.showInformationMessage(`❌ ${message}`);
        }
        
        console.log(`JSON Newline Formatter toggled: ${status}`);
    });

    // Add command to subscriptions for proper cleanup
    context.subscriptions.push(toggleCommand);

    // Listen for JSON file activations
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isJsonFile(editor.document)) {
            console.log('JSON file activated:', editor.document.fileName);
            // Apply decorations to the newly activated JSON file
            decorationManager.applyDecorations(editor.document);
            // Show status bar for JSON files
            statusBarItem.show();
            updateStatusBarItem(decorationManager.isDecorationEnabled());
        } else {
            // Hide status bar for non-JSON files
            statusBarItem.hide();
        }
    });

    context.subscriptions.push(onDidChangeActiveEditor);

    // Handle already open JSON files
    if (vscode.window.activeTextEditor && isJsonFile(vscode.window.activeTextEditor.document)) {
        console.log('JSON file already open:', vscode.window.activeTextEditor.document.fileName);
        // Apply decorations to already open JSON files
        decorationManager.applyDecorations(vscode.window.activeTextEditor.document);
        // Show and update status bar
        statusBarItem.show();
        updateStatusBarItem(decorationManager.isDecorationEnabled());
    }

    // Register clipboard commands for enhanced copy/paste behavior
    editSynchronizer.registerClipboardCommands(context);

    // Add components to subscriptions for proper cleanup
    context.subscriptions.push(decorationManager);
    context.subscriptions.push(editSynchronizer);
    context.subscriptions.push(searchHandler);
    context.subscriptions.push(jsonFeatureIntegration);
    context.subscriptions.push(statusBarItem);
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
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

/**
 * Helper function to check if a document is a JSON file
 */
function isJsonFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'json' || document.languageId === 'jsonc';
}

/**
 * Get the current formatting state
 * @returns True if formatting is currently enabled
 */
export function isFormattingEnabled(): boolean {
    return decorationManager ? decorationManager.isDecorationEnabled() : false;
}

/**
 * Toggle the formatting state programmatically
 * @param enabled Optional specific state to set, if not provided will toggle current state
 */
export function setFormattingEnabled(enabled?: boolean): void {
    if (decorationManager) {
        const newState = enabled !== undefined ? enabled : !decorationManager.isDecorationEnabled();
        decorationManager.setEnabled(newState);
        updateStatusBarItem(newState);
        
        const status = newState ? 'enabled' : 'disabled';
        console.log(`JSON Newline Formatter programmatically ${status}`);
    }
}

/**
 * Create the status bar item for the extension
 * @returns The created status bar item
 */
function createStatusBarItem(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    
    // Set up the status bar item
    item.command = 'json-newline-formatter.toggle';
    item.tooltip = 'Click to toggle JSON newline formatting';
    
    // Initially hide the status bar item
    item.hide();
    
    return item;
}

/**
 * Update the status bar item based on the current formatting state
 * @param isEnabled Whether formatting is currently enabled
 */
function updateStatusBarItem(isEnabled: boolean): void {
    if (!statusBarItem) {
        return;
    }
    
    if (isEnabled) {
        statusBarItem.text = '$(symbol-string) JSON \\n';
        statusBarItem.tooltip = 'JSON Newline Formatting: Enabled (click to disable)';
        statusBarItem.backgroundColor = undefined; // Default background
    } else {
        statusBarItem.text = '$(symbol-string) JSON';
        statusBarItem.tooltip = 'JSON Newline Formatting: Disabled (click to enable)';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}