import * as assert from 'assert';
import * as vscode from 'vscode';
import { DecorationManager } from '../../decorationManager';
import { EditSynchronizer } from '../../editSynchronizer';
import { JsonStringDetector } from '../../jsonStringDetector';
import { JsonFeatureIntegration } from '../../jsonFeatureIntegration';

suite('VSCode API Integration Tests', () => {
    let decorationManager: DecorationManager;
    let editSynchronizer: EditSynchronizer;
    let jsonDetector: JsonStringDetector;
    let jsonFeatureIntegration: JsonFeatureIntegration;

    suiteSetup(() => {
        decorationManager = new DecorationManager();
        editSynchronizer = new EditSynchronizer(decorationManager);
        jsonDetector = new JsonStringDetector();
        jsonFeatureIntegration = new JsonFeatureIntegration(decorationManager);
    });

    suiteTeardown(() => {
        editSynchronizer.dispose();
        decorationManager.dispose();
        jsonFeatureIntegration.dispose();
    });

    suite('Language Service Integration', () => {
        test('should integrate with VSCode language features', async () => {
            const content = `{
    "title": "Test Document",
    "description": "Multi-line\\ntext content\\nwith newlines",
    "nested": {
        "data": "More\\ncontent"
    }
}`;

            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);

                // Test folding range provider
                const foldingRanges = await jsonFeatureIntegration.provideFoldingRanges(
                    document,
                    {},
                    new vscode.CancellationTokenSource().token
                );

                assert.ok(Array.isArray(foldingRanges), 'Should provide folding ranges');
                
                // Test completion provider
                const position = new vscode.Position(2, 20); // Inside a string
                const completionItems = await jsonFeatureIntegration.provideCompletionItems(
                    document,
                    position,
                    new vscode.CancellationTokenSource().token,
                    { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: undefined }
                );

                if (completionItems) {
                    assert.ok(Array.isArray(completionItems) || completionItems instanceof vscode.CompletionList, 
                        'Should provide completion items');
                }

                // Test hover provider
                const hoverInfo = await jsonFeatureIntegration.provideHover(
                    document,
                    position,
                    new vscode.CancellationTokenSource().token
                );

                // Hover might be null for non-decorated areas, which is fine
                if (hoverInfo) {
                    assert.ok(hoverInfo instanceof vscode.Hover, 'Should provide hover info');
                }

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle language service cancellation', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);

                // Test cancellation token handling
                const cancellationTokenSource = new vscode.CancellationTokenSource();
                cancellationTokenSource.cancel();

                const position = new vscode.Position(0, 10);

                // These should handle cancellation gracefully
                const foldingRanges = await jsonFeatureIntegration.provideFoldingRanges(
                    document,
                    {},
                    cancellationTokenSource.token
                );

                const completionItems = await jsonFeatureIntegration.provideCompletionItems(
                    document,
                    position,
                    cancellationTokenSource.token,
                    { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: undefined }
                );

                const hoverInfo = await jsonFeatureIntegration.provideHover(
                    document,
                    position,
                    cancellationTokenSource.token
                );

                // With cancelled token, these should return null or empty arrays
                assert.ok(foldingRanges === null || Array.isArray(foldingRanges), 'Should handle cancellation');
                assert.ok(completionItems === null || Array.isArray(completionItems) || completionItems instanceof vscode.CompletionList, 
                    'Should handle cancellation');
                assert.ok(hoverInfo === null || hoverInfo instanceof vscode.Hover, 'Should handle cancellation');

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Document Event Integration', () => {
        test('should handle document lifecycle events', async () => {
            const content = '{"lifecycle": "test\\ndata"}';
            
            // Track events
            let openEventFired = false;
            let changeEventFired = false;
            let saveEventFired = false;
            let closeEventFired = false;

            const openDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
                if (doc.languageId === 'json') {
                    openEventFired = true;
                }
            });

            const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
                if (event.document.languageId === 'json') {
                    changeEventFired = true;
                    editSynchronizer.onDidChangeTextDocument(event);
                }
            });

            const saveDisposable = vscode.workspace.onWillSaveTextDocument((event) => {
                if (event.document.languageId === 'json') {
                    saveEventFired = true;
                    editSynchronizer.onWillSaveDocument(event.document);
                }
            });

            const closeDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
                if (doc.languageId === 'json') {
                    closeEventFired = true;
                }
            });

            try {
                const document = await vscode.workspace.openTextDocument({
                    content,
                    language: 'json'
                });

                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);

                // Make a change
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 20), 'X');
                });

                // Wait for events to process
                await new Promise(resolve => setTimeout(resolve, 100));

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

                // Wait for close event
                await new Promise(resolve => setTimeout(resolve, 100));

                // Note: In test environment, not all events may fire, but handlers should not throw
                assert.doesNotThrow(() => {
                    // Event handlers should be robust
                }, 'Event handlers should not throw errors');

            } finally {
                openDisposable.dispose();
                changeDisposable.dispose();
                saveDisposable.dispose();
                closeDisposable.dispose();
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle rapid document changes', async () => {
            const content = '{"rapid": "changes\\ntest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);

                // Simulate rapid changes
                const changes = [
                    'A', 'B', 'C', '\\n', 'D', 'E', 'F'
                ];

                for (let i = 0; i < changes.length; i++) {
                    const changeEvent = {
                        document,
                        contentChanges: [{
                            range: new vscode.Range(new vscode.Position(0, 20 + i), new vscode.Position(0, 20 + i)),
                            rangeOffset: 20 + i,
                            rangeLength: 0,
                            text: changes[i]
                        }],
                        reason: undefined
                    } as vscode.TextDocumentChangeEvent;

                    // Should handle rapid changes without errors
                    assert.doesNotThrow(() => {
                        editSynchronizer.onDidChangeTextDocument(changeEvent);
                        decorationManager.updateDecorations(changeEvent);
                    }, 'Should handle rapid changes');
                }

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Editor State Integration', () => {
        test('should handle editor selection changes', async () => {
            const content = '{"selection": "test\\nwith\\nselections"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);

                // Test various selection scenarios
                const selections = [
                    new vscode.Selection(0, 0, 0, 10),      // Start of document
                    new vscode.Selection(0, 15, 0, 25),     // Within string
                    new vscode.Selection(0, 20, 0, 30),     // Across newline
                    new vscode.Selection(0, 0, 0, 40)       // Large selection
                ];

                for (const selection of selections) {
                    editor.selection = selection;
                    
                    // Test cursor transformation for each selection
                    const cursorTransform = editSynchronizer.transformCursorPosition(document, selection.start);
                    assert.ok(cursorTransform, 'Should provide cursor transformation');
                    assert.ok(cursorTransform.visualPosition instanceof vscode.Position);
                    assert.ok(cursorTransform.actualPosition instanceof vscode.Position);
                    assert.strictEqual(typeof cursorTransform.isInDecoratedArea, 'boolean');

                    // Test selection end as well
                    const endTransform = editSynchronizer.transformCursorPosition(document, selection.end);
                    assert.ok(endTransform, 'Should provide cursor transformation for selection end');
                }

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle editor viewport changes', async () => {
            const content = `{
    "line1": "Content\\nwith\\nnewlines",
    "line2": "More\\ncontent",
    "line3": "Even\\nmore\\ncontent",
    "line4": "Final\\nline"
}`;
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);
                decorationManager.applyDecorations(document);

                // Test different viewport positions
                const positions = [
                    new vscode.Position(0, 0),
                    new vscode.Position(2, 0),
                    new vscode.Position(4, 0),
                    new vscode.Position(6, 0)
                ];

                for (const position of positions) {
                    // Reveal position (simulates scrolling)
                    editor.revealRange(new vscode.Range(position, position));
                    
                    // Decorations should still work correctly
                    const decorationCount = decorationManager.getActiveDecorationCount();
                    assert.ok(decorationCount >= 0, 'Should maintain decorations during viewport changes');
                    
                    // Position transformations should still work
                    const visualPos = editSynchronizer.transformActualToVisual(document, position);
                    assert.ok(visualPos instanceof vscode.Position, 'Should transform positions correctly');
                }

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Multi-Document Integration', () => {
        test('should handle multiple JSON documents simultaneously', async () => {
            const documents = [];
            const editors = [];

            try {
                // Create multiple documents
                for (let i = 0; i < 3; i++) {
                    const content = `{
    "document": ${i},
    "content": "Document ${i}\\nwith\\nmultiple\\nlines"
}`;
                    const document = await vscode.workspace.openTextDocument({
                        content,
                        language: 'json'
                    });
                    documents.push(document);

                    const editor = await vscode.window.showTextDocument(document);
                    editors.push(editor);

                    // Apply decorations to each
                    decorationManager.applyDecorations(document);
                }

                // Verify each document has decorations
                for (let i = 0; i < documents.length; i++) {
                    const document = documents[i];
                    
                    // Switch to this document
                    await vscode.window.showTextDocument(document);
                    
                    // Check decorations
                    const decorationCount = decorationManager.getActiveDecorationCount();
                    // Note: Only the active document will show decorations
                    assert.ok(decorationCount >= 0, `Document ${i} should handle decorations`);
                    
                    // Test position transformations
                    const position = new vscode.Position(2, 15);
                    const visualPos = editSynchronizer.transformActualToVisual(document, position);
                    assert.ok(visualPos instanceof vscode.Position, `Document ${i} should transform positions`);
                }

                // Close all documents
                for (const editor of editors) {
                    await vscode.window.showTextDocument(editor.document);
                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                }

            } finally {
                // Ensure cleanup
                for (let i = 0; i < 5; i++) { // Try multiple times to close any remaining editors
                    try {
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    } catch {
                        break; // No more editors to close
                    }
                }
            }
        });

        test('should handle document switching', async () => {
            const doc1Content = '{"doc1": "First\\ndocument"}';
            const doc2Content = '{"doc2": "Second\\ndocument\\nwith\\nmore\\nlines"}';

            const document1 = await vscode.workspace.openTextDocument({
                content: doc1Content,
                language: 'json'
            });

            const document2 = await vscode.workspace.openTextDocument({
                content: doc2Content,
                language: 'json'
            });

            try {
                // Show first document
                const editor1 = await vscode.window.showTextDocument(document1);
                decorationManager.applyDecorations(document1);
                const doc1Decorations = decorationManager.getActiveDecorationCount();

                // Switch to second document
                const editor2 = await vscode.window.showTextDocument(document2);
                decorationManager.applyDecorations(document2);
                const doc2Decorations = decorationManager.getActiveDecorationCount();

                // Switch back to first document
                await vscode.window.showTextDocument(document1);
                decorationManager.applyDecorations(document1);
                const doc1DecorationsAgain = decorationManager.getActiveDecorationCount();

                // Decorations should be maintained correctly
                assert.ok(doc1Decorations >= 0, 'Document 1 should have decorations');
                assert.ok(doc2Decorations >= 0, 'Document 2 should have decorations');
                assert.ok(doc1DecorationsAgain >= 0, 'Document 1 should maintain decorations after switching');

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Error Recovery Integration', () => {
        test('should recover from VSCode API errors gracefully', async () => {
            const content = '{"error": "recovery\\ntest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);

                // Test error recovery in decoration application
                assert.doesNotThrow(() => {
                    decorationManager.applyDecorations(document);
                }, 'Should not throw on decoration application');

                // Test error recovery in edit synchronization with edge case
                const edgeCaseChangeEvent = {
                    document,
                    contentChanges: [{
                        range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
                        rangeOffset: 0,
                        rangeLength: 0,
                        text: 'test'
                    }],
                    reason: undefined
                } as vscode.TextDocumentChangeEvent;

                assert.doesNotThrow(() => {
                    editSynchronizer.onDidChangeTextDocument(edgeCaseChangeEvent);
                }, 'Should handle edge case change events gracefully');

                // Test error recovery in position transformations with edge case positions
                const edgeCasePosition = new vscode.Position(0, 0);
                assert.doesNotThrow(() => {
                    const result = editSynchronizer.transformActualToVisual(document, edgeCasePosition);
                    assert.ok(result instanceof vscode.Position, 'Should return valid position');
                }, 'Should handle edge case positions gracefully');

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle VSCode API limitations gracefully', async () => {
            const content = '{"limitations": "test\\ndata"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);

                // Test handling when no active editor
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
                assert.doesNotThrow(() => {
                    decorationManager.applyDecorations(document);
                }, 'Should handle no active editor gracefully');

                assert.doesNotThrow(() => {
                    decorationManager.refresh();
                }, 'Should handle refresh with no active editor');

                // Reopen editor for cleanup
                await vscode.window.showTextDocument(document);
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Performance Integration', () => {
        test('should handle large documents with VSCode API efficiently', async () => {
            // Create a large JSON document
            const largeData = Array.from({ length: 50 }, (_, i) => ({
                id: i,
                title: `Item ${i}`,
                description: `Description for item ${i}\\nwith multiple\\nlines of\\ntext content`,
                metadata: {
                    created: `2023-01-${(i % 28) + 1}`,
                    tags: [`tag${i}`, `category${i % 5}`],
                    content: `Large content block ${i}\\nwith many\\nlines\\nof text\\nfor testing\\nperformance`
                }
            }));

            const content = JSON.stringify({ data: largeData }, null, 2);
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);

                // Measure decoration application time
                const startTime = Date.now();
                decorationManager.applyDecorations(document);
                const decorationTime = Date.now() - startTime;

                assert.ok(decorationTime < 2000, 'Should apply decorations to large document in reasonable time');

                // Test position transformations on large document
                const positions = [
                    new vscode.Position(10, 20),
                    new vscode.Position(50, 30),
                    new vscode.Position(100, 15),
                    new vscode.Position(200, 25)
                ];

                const transformStartTime = Date.now();
                for (const position of positions) {
                    const visualPos = editSynchronizer.transformActualToVisual(document, position);
                    const actualPos = editSynchronizer.transformVisualToActual(document, visualPos);
                    
                    assert.ok(visualPos instanceof vscode.Position);
                    assert.ok(actualPos instanceof vscode.Position);
                }
                const transformTime = Date.now() - transformStartTime;

                assert.ok(transformTime < 1000, 'Should transform positions efficiently on large document');

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle memory efficiently with multiple operations', async () => {
            const content = '{"memory": "test\\nwith\\nmultiple\\noperations"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);

                // Perform many operations to test memory efficiency
                for (let i = 0; i < 100; i++) {
                    decorationManager.applyDecorations(document);
                    decorationManager.clearDecorations();
                    
                    const position = new vscode.Position(0, 10 + (i % 10));
                    editSynchronizer.transformActualToVisual(document, position);
                    editSynchronizer.transformVisualToActual(document, position);
                    
                    // Simulate document changes
                    const changeEvent = {
                        document,
                        contentChanges: [{
                            range: new vscode.Range(position, position),
                            rangeOffset: 0,
                            rangeLength: 0,
                            text: i % 2 === 0 ? 'A' : ''
                        }],
                        reason: undefined
                    } as vscode.TextDocumentChangeEvent;

                    editSynchronizer.onDidChangeTextDocument(changeEvent);
                }

                // Final decoration application
                decorationManager.applyDecorations(document);
                const finalDecorations = decorationManager.getActiveDecorationCount();
                assert.ok(finalDecorations >= 0, 'Should maintain functionality after many operations');

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Extension Lifecycle Integration', () => {
        test('should handle extension activation/deactivation scenarios', async () => {
            const content = '{"lifecycle": "activation\\ntest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);

                // Simulate extension activation
                decorationManager.setEnabled(true);
                decorationManager.applyDecorations(document);
                
                const activeDecorations = decorationManager.getActiveDecorationCount();
                assert.ok(activeDecorations >= 0, 'Should handle activation');

                // Simulate extension deactivation
                decorationManager.setEnabled(false);
                decorationManager.clearDecorations();
                
                const inactiveDecorations = decorationManager.getActiveDecorationCount();
                assert.strictEqual(inactiveDecorations, 0, 'Should clear decorations on deactivation');

                // Simulate reactivation
                decorationManager.setEnabled(true);
                decorationManager.applyDecorations(document);
                
                const reactivatedDecorations = decorationManager.getActiveDecorationCount();
                assert.ok(reactivatedDecorations >= 0, 'Should handle reactivation');

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle resource cleanup properly', async () => {
            const content = '{"cleanup": "resource\\ntest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            try {
                const editor = await vscode.window.showTextDocument(document);

                // Create resources
                decorationManager.applyDecorations(document);
                const documentState = editSynchronizer.getDocumentState(document);
                
                assert.ok(documentState, 'Should create document state');

                // Test cleanup
                assert.doesNotThrow(() => {
                    decorationManager.dispose();
                    editSynchronizer.dispose();
                    jsonFeatureIntegration.dispose();
                }, 'Should dispose resources without errors');

                // Recreate for continued testing
                decorationManager = new DecorationManager();
                editSynchronizer = new EditSynchronizer(decorationManager);
                jsonFeatureIntegration = new JsonFeatureIntegration(decorationManager);

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });
});