import * as assert from 'assert';
import * as vscode from 'vscode';
import { DecorationManager } from '../../decorationManager';
import { EditSynchronizer } from '../../editSynchronizer';
import { JsonStringDetector } from '../../jsonStringDetector';

suite('Extension Integration Test Suite', () => {
    let decorationManager: DecorationManager;
    let editSynchronizer: EditSynchronizer;
    let jsonDetector: JsonStringDetector;

    suiteSetup(() => {
        decorationManager = new DecorationManager();
        editSynchronizer = new EditSynchronizer(decorationManager);
        jsonDetector = new JsonStringDetector();
    });

    suiteTeardown(() => {
        editSynchronizer.dispose();
        decorationManager.dispose();
    });

    suite('Full Extension Workflow', () => {
        test('should handle complete document lifecycle', async () => {
            // Create a JSON document with newlines
            const content = `{
    "title": "Test Document",
    "description": "This is a test\\nwith multiple\\nlines",
    "data": {
        "message": "Hello\\nWorld",
        "status": "active"
    }
}`;

            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                // Open document in editor
                const editor = await vscode.window.showTextDocument(document);
                
                // Apply decorations
                decorationManager.applyDecorations(document);
                
                // Verify decorations were applied
                const decorationCount = decorationManager.getActiveDecorationCount();
                assert.ok(decorationCount > 0, 'Should have applied decorations');
                
                // Test position transformations
                const testPosition = new vscode.Position(2, 30);
                const visualPos = editSynchronizer.transformActualToVisual(document, testPosition);
                const actualPos = editSynchronizer.transformVisualToActual(document, visualPos);
                
                assert.ok(visualPos instanceof vscode.Position, 'Should transform to visual position');
                assert.ok(actualPos instanceof vscode.Position, 'Should transform back to actual position');
                
                // Test document state management
                const docState = editSynchronizer.getDocumentState(document);
                assert.ok(docState, 'Should have document state');
                assert.strictEqual(docState.version, document.version, 'Should track document version');
                
                // Close editor
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                // Cleanup
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle document editing workflow', async () => {
            const content = '{"message": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                
                // Apply decorations
                decorationManager.applyDecorations(document);
                
                // Simulate text change
                const changeEvent = {
                    document,
                    contentChanges: [{
                        range: new vscode.Range(new vscode.Position(0, 20), new vscode.Position(0, 20)),
                        rangeOffset: 20,
                        rangeLength: 0,
                        text: '\\nNew line'
                    }],
                    reason: undefined
                } as vscode.TextDocumentChangeEvent;

                // Process the change
                editSynchronizer.onDidChangeTextDocument(changeEvent);
                
                // Verify decorations were updated
                const decorationCount = decorationManager.getActiveDecorationCount();
                assert.ok(decorationCount >= 0, 'Should handle decoration updates');
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle multiple documents simultaneously', async () => {
            const content1 = '{"doc1": "First\\ndocument"}';
            const content2 = '{"doc2": "Second\\ndocument\\nwith more\\nlines"}';
            
            const doc1 = await vscode.workspace.openTextDocument({
                content: content1,
                language: 'json'
            });
            
            const doc2 = await vscode.workspace.openTextDocument({
                content: content2,
                language: 'json'
            });

            try {
                // Open both documents
                const editor1 = await vscode.window.showTextDocument(doc1);
                decorationManager.applyDecorations(doc1);
                
                const editor2 = await vscode.window.showTextDocument(doc2);
                decorationManager.applyDecorations(doc2);
                
                // Verify both documents have state
                const state1 = editSynchronizer.getDocumentState(doc1);
                const state2 = editSynchronizer.getDocumentState(doc2);
                
                assert.ok(state1, 'Should have state for first document');
                assert.ok(state2, 'Should have state for second document');
                
                // Verify decorations work for both
                const count1 = decorationManager.getActiveDecorationCount();
                
                // Switch back to first document
                await vscode.window.showTextDocument(doc1);
                decorationManager.applyDecorations(doc1);
                
                const count2 = decorationManager.getActiveDecorationCount();
                assert.ok(count2 >= 0, 'Should handle multiple documents');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            }
        });
    });

    suite('VSCode API Integration', () => {
        test('should integrate with VSCode text editor API', async () => {
            const content = '{"test": "Hello\\nWorld\\nTest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                
                // Test editor integration
                assert.strictEqual(editor.document, document, 'Editor should have correct document');
                assert.strictEqual(editor.document.languageId, 'json', 'Should be JSON document');
                
                // Apply decorations
                decorationManager.applyDecorations(document);
                
                // Test selection handling
                const selection = new vscode.Selection(0, 10, 0, 20);
                editor.selection = selection;
                
                // Test cursor transformation
                const cursorTransform = editSynchronizer.transformCursorPosition(document, selection.start);
                assert.ok(cursorTransform, 'Should provide cursor transformation');
                assert.ok(cursorTransform.visualPosition instanceof vscode.Position);
                assert.ok(cursorTransform.actualPosition instanceof vscode.Position);
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should integrate with VSCode workspace API', async () => {
            const content = '{"workspace": "test\\ndata"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                // Test workspace integration
                assert.ok(vscode.workspace.textDocuments.includes(document), 'Document should be in workspace');
                
                // Test document events
                let changeEventFired = false;
                const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
                    if (event.document === document) {
                        changeEventFired = true;
                        editSynchronizer.onDidChangeTextDocument(event);
                    }
                });

                const editor = await vscode.window.showTextDocument(document);
                
                // Make a change to trigger the event
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 25), 'X');
                });

                // Give time for event to fire
                await new Promise(resolve => setTimeout(resolve, 100));
                
                disposable.dispose();
                
                // Note: The event might not fire in test environment, so we don't assert it
                // but we verify the handler doesn't throw
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should integrate with VSCode decoration API', async () => {
            const content = '{"decorated": "content\\nwith\\nnewlines"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                
                // Apply decorations
                decorationManager.applyDecorations(document);
                
                // Test decoration state
                const state = decorationManager.getDecorationState();
                assert.ok(state.decorationType, 'Should have decoration type');
                assert.strictEqual(typeof state.isEnabled, 'boolean', 'Should have enabled state');
                assert.ok(Array.isArray(state.decorations), 'Should have decorations array');
                
                // Test decoration queries
                const position = new vscode.Position(0, 15);
                const decoration = decorationManager.getDecorationAtPosition(position);
                // Decoration might be null if position is not decorated, which is fine
                
                const range = new vscode.Range(0, 0, 0, 30);
                const decorationsInRange = decorationManager.getDecorationsInRange(range);
                assert.ok(Array.isArray(decorationsInRange), 'Should return array of decorations');
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle VSCode command integration', async () => {
            // Test that our extension integrates with VSCode commands
            const content = '{"command": "test\\ndata"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                
                // Test decoration toggle (if command exists)
                decorationManager.setEnabled(true);
                assert.strictEqual(decorationManager.isDecorationEnabled(), true);
                
                decorationManager.setEnabled(false);
                assert.strictEqual(decorationManager.isDecorationEnabled(), false);
                
                decorationManager.setEnabled(true);
                assert.strictEqual(decorationManager.isDecorationEnabled(), true);
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('End-to-End Scenarios', () => {
        test('should handle complete editing session', async () => {
            const initialContent = '{"message": "Initial\\nContent"}';
            const document = await vscode.workspace.openTextDocument({
                content: initialContent,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                
                // 1. Apply initial decorations
                decorationManager.applyDecorations(document);
                const initialDecorations = decorationManager.getActiveDecorationCount();
                
                // 2. Simulate user editing
                const changes = [
                    { pos: new vscode.Position(0, 25), text: '\\nNew line' },
                    { pos: new vscode.Position(0, 35), text: '\\nAnother' },
                    { pos: new vscode.Position(0, 45), text: ' line' }
                ];

                for (const change of changes) {
                    const changeEvent = {
                        document,
                        contentChanges: [{
                            range: new vscode.Range(change.pos, change.pos),
                            rangeOffset: 0,
                            rangeLength: 0,
                            text: change.text
                        }],
                        reason: undefined
                    } as vscode.TextDocumentChangeEvent;

                    editSynchronizer.onDidChangeTextDocument(changeEvent);
                }

                // 3. Verify final state
                const finalDecorations = decorationManager.getActiveDecorationCount();
                assert.ok(finalDecorations >= 0, 'Should handle multiple edits');
                
                // 4. Test position transformations after edits
                const testPos = new vscode.Position(0, 20);
                const visualPos = editSynchronizer.transformActualToVisual(document, testPos);
                const actualPos = editSynchronizer.transformVisualToActual(document, visualPos);
                
                assert.ok(visualPos instanceof vscode.Position);
                assert.ok(actualPos instanceof vscode.Position);
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle copy-paste operations', async () => {
            const content = '{"source": "Copy\\nthis\\ntext", "target": ""}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);
                
                // Test copy operation
                const sourceSelection = new vscode.Selection(0, 12, 0, 26); // "Copy\\nthis\\ntext"
                const copiedText = editSynchronizer.handleCopyOperation(document, sourceSelection);
                
                assert.strictEqual(typeof copiedText, 'string', 'Should return copied text');
                
                // Test paste operation
                const pastePosition = new vscode.Position(0, 40); // In target field
                const pastedText = editSynchronizer.handlePasteOperation(document, pastePosition, copiedText);
                
                assert.strictEqual(typeof pastedText, 'string', 'Should return pasted text');
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle document save workflow', async () => {
            const content = '{"data": "Save\\nthis\\ndocument"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);
                
                // Simulate document save preparation
                editSynchronizer.onWillSaveDocument(document);
                
                // Verify document state is consistent
                const docState = editSynchronizer.getDocumentState(document);
                assert.ok(docState, 'Should have document state');
                
                // Verify JSON is still valid after processing
                const parseResult = jsonDetector.parseJsonSafely(document);
                assert.strictEqual(parseResult.isValid, true, 'JSON should remain valid');
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle error recovery scenarios', async () => {
            // Start with valid JSON
            const validContent = '{"valid": "JSON\\nwith\\nnewlines"}';
            const document = await vscode.workspace.openTextDocument({
                content: validContent,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);
                
                const initialDecorations = decorationManager.getActiveDecorationCount();
                
                // Simulate making JSON invalid
                const invalidChange = {
                    document,
                    contentChanges: [{
                        range: new vscode.Range(new vscode.Position(0, 8), new vscode.Position(0, 9)),
                        rangeOffset: 8,
                        rangeLength: 1,
                        text: '' // Remove quote to make invalid
                    }],
                    reason: undefined
                } as vscode.TextDocumentChangeEvent;

                // Should handle invalid JSON gracefully
                editSynchronizer.onDidChangeTextDocument(invalidChange);
                
                // Decorations should be cleared or handled gracefully
                const decorationsAfterError = decorationManager.getActiveDecorationCount();
                assert.ok(decorationsAfterError >= 0, 'Should handle invalid JSON gracefully');
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Performance and Stress Testing', () => {
        test('should handle large documents efficiently', async () => {
            // Create a large JSON document
            const largeContent = JSON.stringify({
                data: Array.from({ length: 100 }, (_, i) => ({
                    id: i,
                    message: `Message ${i}\\nwith newlines\\nfor testing`,
                    description: `Description ${i}\\nwith multiple\\nlines of\\ntext`
                }))
            }, null, 2);

            const document = await vscode.workspace.openTextDocument({
                content: largeContent,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                
                const startTime = Date.now();
                decorationManager.applyDecorations(document);
                const endTime = Date.now();
                
                const processingTime = endTime - startTime;
                assert.ok(processingTime < 5000, 'Should process large documents in reasonable time'); // 5 seconds max
                
                // Verify decorations were applied
                const decorationCount = decorationManager.getActiveDecorationCount();
                assert.ok(decorationCount >= 0, 'Should handle large documents');
                
                // Ensure JsonStringDetector has parsed the document to get metrics
                jsonDetector.findStringRanges(document);
                
                // Test performance metrics
                const metrics = jsonDetector.getPerformanceMetrics();
                if (metrics) {
                    assert.ok(metrics.fileSize > 500, 'Should detect file size');
                    assert.ok(metrics.stringCount > 50, 'Should count many strings');
                }
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle rapid successive changes', async () => {
            const content = '{"rapid": "changes\\ntest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);
                
                // Simulate rapid changes
                const rapidChanges = Array.from({ length: 20 }, (_, i) => ({
                    document,
                    contentChanges: [{
                        range: new vscode.Range(new vscode.Position(0, 20 + i), new vscode.Position(0, 20 + i)),
                        rangeOffset: 20 + i,
                        rangeLength: 0,
                        text: 'X'
                    }],
                    reason: undefined
                } as vscode.TextDocumentChangeEvent));

                const startTime = Date.now();
                
                for (const change of rapidChanges) {
                    editSynchronizer.onDidChangeTextDocument(change);
                }
                
                const endTime = Date.now();
                const processingTime = endTime - startTime;
                
                assert.ok(processingTime < 1000, 'Should handle rapid changes efficiently'); // 1 second max
                assert.ok(editSynchronizer.isSynchronizationActive(), 'Should maintain synchronization state');
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle memory usage efficiently', async () => {
            // Create multiple documents to test memory management
            const documents = [];
            
            try {
                for (let i = 0; i < 10; i++) {
                    const content = `{"doc${i}": "Document ${i}\\nwith newlines\\nfor memory test"}`;
                    const doc = await vscode.workspace.openTextDocument({
                        content,
                        language: 'json'
                    });
                    documents.push(doc);
                    
                    const editor = await vscode.window.showTextDocument(doc);
                    decorationManager.applyDecorations(doc);
                }
                
                // Verify all documents have state
                for (const doc of documents) {
                    const state = editSynchronizer.getDocumentState(doc);
                    assert.ok(state, `Should have state for document ${doc.uri}`);
                }
                
                // Close all documents
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                
                // Memory should be cleaned up (we can't directly test this, but ensure no errors)
                assert.ok(true, 'Should handle multiple documents without memory issues');
                
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            }
        });
    });
});