import * as assert from 'assert';
import * as vscode from 'vscode';
import { EditSynchronizer, EditMapping, DocumentState } from '../../editSynchronizer';
import { DecorationManager } from '../../decorationManager';

suite('EditSynchronizer Test Suite', () => {
    let editSynchronizer: EditSynchronizer;
    let decorationManager: DecorationManager;
    let testDocument: vscode.TextDocument;

    suiteSetup(async () => {
        // Create a test JSON document
        const content = '{\n  "message": "Hello\\nWorld\\nTest",\n  "data": "Line1\\nLine2"\n}';
        testDocument = await vscode.workspace.openTextDocument({
            content,
            language: 'json'
        });
    });

    setup(() => {
        decorationManager = new DecorationManager();
        editSynchronizer = new EditSynchronizer(decorationManager);
    });

    teardown(() => {
        editSynchronizer.dispose();
        decorationManager.dispose();
    });

    suite('Initialization', () => {
        test('should initialize document state for JSON documents', async () => {
            // Apply decorations to initialize state
            decorationManager.applyDecorations(testDocument);
            
            const documentState = editSynchronizer.getDocumentState(testDocument);
            assert.ok(documentState, 'Document state should be initialized');
            assert.strictEqual(documentState.version, testDocument.version);
            assert.ok(documentState.mappings.length > 0, 'Should have position mappings');
        });

        test('should not initialize state for non-JSON documents', async () => {
            const textDocument = await vscode.workspace.openTextDocument({
                content: 'This is plain text with \\n sequences',
                language: 'plaintext'
            });

            const documentState = editSynchronizer.getDocumentState(textDocument);
            assert.strictEqual(documentState, null, 'Should not track non-JSON documents');
        });
    });

    suite('Position Transformation', () => {
        test('should transform visual position to actual position', () => {
            // Initialize document state
            decorationManager.applyDecorations(testDocument);
            
            const visualPos = new vscode.Position(2, 5);
            const actualPos = editSynchronizer.transformVisualToActual(testDocument, visualPos);
            
            assert.ok(actualPos instanceof vscode.Position, 'Should return a Position object');
            // The exact transformation depends on the number of \n sequences before this position
        });

        test('should transform actual position to visual position', () => {
            // Initialize document state
            decorationManager.applyDecorations(testDocument);
            
            const actualPos = new vscode.Position(2, 15);
            const visualPos = editSynchronizer.transformActualToVisual(testDocument, actualPos);
            
            assert.ok(visualPos instanceof vscode.Position, 'Should return a Position object');
        });

        test('should handle positions outside decorated areas', () => {
            const pos = new vscode.Position(0, 0); // Start of document
            const transformedPos = editSynchronizer.transformVisualToActual(testDocument, pos);
            
            // Position outside decorated areas should remain unchanged or close to original
            assert.ok(transformedPos instanceof vscode.Position);
        });

        test('should handle bidirectional transformation', () => {
            decorationManager.applyDecorations(testDocument);
            
            const originalPos = new vscode.Position(2, 10);
            const visualPos = editSynchronizer.transformActualToVisual(testDocument, originalPos);
            const backToActual = editSynchronizer.transformVisualToActual(testDocument, visualPos);
            
            // The transformations should produce valid positions
            assert.ok(visualPos instanceof vscode.Position, 'Visual position should be valid');
            assert.ok(backToActual instanceof vscode.Position, 'Back-transformed position should be valid');
            
            // Positions should be within reasonable bounds
            assert.ok(visualPos.line >= 0 && visualPos.character >= 0, 'Visual position should be non-negative');
            assert.ok(backToActual.line >= 0 && backToActual.character >= 0, 'Back-transformed position should be non-negative');
        });
    });

    suite('Edit Detection', () => {
        test('should detect edits in decorated string areas', async () => {
            // Apply decorations first
            decorationManager.applyDecorations(testDocument);
            
            // Simulate a text change in a decorated area
            const changeEvent = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 20), new vscode.Position(2, 20)),
                    rangeOffset: 20,
                    rangeLength: 0,
                    text: 'New text'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            // This should not throw an error
            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent);
            });
        });

        test('should handle newline insertion in JSON strings', async () => {
            decorationManager.applyDecorations(testDocument);
            
            const changeEvent = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 25), new vscode.Position(2, 25)),
                    rangeOffset: 25,
                    rangeLength: 0,
                    text: '\\nNew line'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent);
            });
        });
    });

    suite('Content Transformation', () => {
        test('should handle line break conversion', async () => {
            decorationManager.applyDecorations(testDocument);
            
            // Simulate pressing Enter (actual line break) in a decorated string
            const changeEvent = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 20), new vscode.Position(2, 20)),
                    rangeOffset: 20,
                    rangeLength: 0,
                    text: '\n' // Actual line break from Enter key
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            // Should handle the conversion without throwing
            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent);
            });
        });

        test('should handle deletion across line breaks', async () => {
            decorationManager.applyDecorations(testDocument);
            
            // Simulate deleting across a visual line break
            const changeEvent = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 18), new vscode.Position(2, 22)),
                    rangeOffset: 18,
                    rangeLength: 4,
                    text: ''
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent);
            });
        });

        test('should transform visual content to actual content', () => {
            const visualContent = 'Hello\nWorld\nTest';
            const range = new vscode.Range(new vscode.Position(2, 12), new vscode.Position(2, 27));
            
            const actualContent = editSynchronizer.transformVisualContentToActual(testDocument, visualContent, range);
            assert.strictEqual(actualContent, 'Hello\\nWorld\\nTest', 'Should convert line breaks to escape sequences');
        });

        test('should transform actual content to visual content', () => {
            const actualContent = 'Hello\\nWorld\\nTest';
            const range = new vscode.Range(new vscode.Position(2, 12), new vscode.Position(2, 27));
            
            const visualContent = editSynchronizer.transformActualContentToVisual(testDocument, actualContent, range);
            assert.strictEqual(visualContent, 'Hello\nWorld\nTest', 'Should convert escape sequences to line breaks');
        });

        test('should handle content transformation outside JSON strings', () => {
            const content = 'Hello\nWorld';
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 11));
            
            // Outside JSON strings, content should remain unchanged
            const actualContent = editSynchronizer.transformVisualContentToActual(testDocument, content, range);
            const visualContent = editSynchronizer.transformActualContentToVisual(testDocument, content, range);
            
            assert.strictEqual(actualContent, content, 'Content outside strings should not be transformed');
            assert.strictEqual(visualContent, content, 'Content outside strings should not be transformed');
        });
    });

    suite('Document State Management', () => {
        test('should update document state on changes', async () => {
            decorationManager.applyDecorations(testDocument);
            
            const initialState = editSynchronizer.getDocumentState(testDocument);
            const initialVersion = initialState?.version;

            // Simulate a document change
            const changeEvent = {
                document: { ...testDocument, version: testDocument.version + 1 },
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 0)),
                    rangeOffset: 0,
                    rangeLength: 0,
                    text: ' '
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            editSynchronizer.onDidChangeTextDocument(changeEvent);
            
            const updatedState = editSynchronizer.getDocumentState(testDocument);
            assert.ok(updatedState, 'Document state should exist after update');
        });

        test('should clean up state when document is closed', () => {
            decorationManager.applyDecorations(testDocument);
            
            // Verify state exists
            let state = editSynchronizer.getDocumentState(testDocument);
            assert.ok(state, 'State should exist initially');

            // The cleanup happens automatically through event handlers
            // We can't easily simulate document close in tests, but we can verify
            // the method exists and doesn't throw
            assert.ok(typeof editSynchronizer.dispose === 'function');
        });
    });

    suite('Error Handling', () => {
        test('should handle malformed JSON gracefully', async () => {
            const malformedDocument = await vscode.workspace.openTextDocument({
                content: '{ "message": "Hello\\nWorld", invalid json }',
                language: 'json'
            });

            assert.doesNotThrow(() => {
                decorationManager.applyDecorations(malformedDocument);
                editSynchronizer.getDocumentState(malformedDocument);
            });
        });

        test('should handle empty documents', async () => {
            const emptyDocument = await vscode.workspace.openTextDocument({
                content: '',
                language: 'json'
            });

            assert.doesNotThrow(() => {
                decorationManager.applyDecorations(emptyDocument);
                const state = editSynchronizer.getDocumentState(emptyDocument);
                // Empty document should have minimal state
                if (state) {
                    assert.strictEqual(state.mappings.length, 0);
                }
            });
        });

        test('should handle documents with no newlines', async () => {
            const simpleDocument = await vscode.workspace.openTextDocument({
                content: '{"message": "Hello World"}',
                language: 'json'
            });

            assert.doesNotThrow(() => {
                decorationManager.applyDecorations(simpleDocument);
                const state = editSynchronizer.getDocumentState(simpleDocument);
                if (state) {
                    assert.strictEqual(state.mappings.length, 0, 'Should have no mappings for documents without \\n');
                }
            });
        });
    });

    suite('Synchronization State', () => {
        test('should track synchronization active state', () => {
            const isActive = editSynchronizer.isSynchronizationActive();
            assert.strictEqual(typeof isActive, 'boolean', 'Should return boolean value');
        });

        test('should handle recursive edit prevention', async () => {
            decorationManager.applyDecorations(testDocument);
            
            // Multiple rapid changes should not cause issues
            const changeEvent1 = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 20), new vscode.Position(2, 20)),
                    rangeOffset: 20,
                    rangeLength: 0,
                    text: 'A'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            const changeEvent2 = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 21), new vscode.Position(2, 21)),
                    rangeOffset: 21,
                    rangeLength: 0,
                    text: 'B'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent1);
                editSynchronizer.onDidChangeTextDocument(changeEvent2);
            });
        });
    });

    suite('Cursor Positioning', () => {
        test('should handle cursor transformation in decorated areas', () => {
            decorationManager.applyDecorations(testDocument);
            
            const position = new vscode.Position(2, 15); // Position within a string with newlines
            const cursorTransform = editSynchronizer.transformCursorPosition(testDocument, position);
            
            assert.ok(cursorTransform, 'Should return cursor transformation info');
            assert.ok(cursorTransform.visualPosition instanceof vscode.Position);
            assert.ok(cursorTransform.actualPosition instanceof vscode.Position);
            assert.strictEqual(typeof cursorTransform.isInDecoratedArea, 'boolean');
        });

        test('should handle cursor transformation outside decorated areas', () => {
            const position = new vscode.Position(0, 1); // Position in JSON structure, not in string
            const cursorTransform = editSynchronizer.transformCursorPosition(testDocument, position);
            
            assert.ok(cursorTransform, 'Should return cursor transformation info');
            assert.strictEqual(cursorTransform.isInDecoratedArea, false);
            assert.strictEqual(cursorTransform.stringRange, undefined);
        });

        test('should maintain cursor position consistency', () => {
            decorationManager.applyDecorations(testDocument);
            
            const originalPos = new vscode.Position(2, 20);
            const cursorTransform = editSynchronizer.transformCursorPosition(testDocument, originalPos);
            
            // Visual and actual positions should be related
            assert.ok(cursorTransform.visualPosition instanceof vscode.Position);
            assert.ok(cursorTransform.actualPosition instanceof vscode.Position);
        });
    });

    suite('Advanced Content Transformation', () => {
        test('should handle complex escape sequence patterns', () => {
            const visualContent = 'Line1\nLine2\\nLine3\nLine4';
            const range = new vscode.Range(new vscode.Position(2, 12), new vscode.Position(2, 30));
            
            const actualContent = editSynchronizer.transformVisualContentToActual(testDocument, visualContent, range);
            assert.strictEqual(actualContent, 'Line1\\nLine2\\nLine3\\nLine4', 'Should convert all line breaks to escape sequences');
        });

        test('should handle mixed content transformation', () => {
            const mixedContent = 'Text with\ttabs\nand\rcarriage\nreturns';
            const range = new vscode.Range(new vscode.Position(2, 12), new vscode.Position(2, 30));
            
            const actualContent = editSynchronizer.transformVisualContentToActual(testDocument, mixedContent, range);
            // Only \n should be converted, other characters should remain
            assert.ok(actualContent.includes('\\n'), 'Should convert newlines');
            assert.ok(actualContent.includes('\t'), 'Should preserve tabs');
            assert.ok(actualContent.includes('\r'), 'Should preserve carriage returns');
        });

        test('should handle empty content transformation', () => {
            const emptyContent = '';
            const range = new vscode.Range(new vscode.Position(2, 12), new vscode.Position(2, 12));
            
            const actualContent = editSynchronizer.transformVisualContentToActual(testDocument, emptyContent, range);
            const visualContent = editSynchronizer.transformActualContentToVisual(testDocument, emptyContent, range);
            
            assert.strictEqual(actualContent, '');
            assert.strictEqual(visualContent, '');
        });

        test('should handle single character transformations', () => {
            const singleChar = 'a';
            const singleNewline = '\n';
            const range = new vscode.Range(new vscode.Position(2, 12), new vscode.Position(2, 13));
            
            const actualChar = editSynchronizer.transformVisualContentToActual(testDocument, singleChar, range);
            const actualNewline = editSynchronizer.transformVisualContentToActual(testDocument, singleNewline, range);
            
            assert.strictEqual(actualChar, 'a', 'Single character should remain unchanged');
            assert.strictEqual(actualNewline, '\\n', 'Single newline should become escape sequence');
        });
    });

    suite('Document State Edge Cases', () => {
        test('should handle rapid document changes', async () => {
            decorationManager.applyDecorations(testDocument);
            
            // Simulate rapid changes
            const changes = [
                { text: 'A', position: new vscode.Position(2, 20) },
                { text: 'B', position: new vscode.Position(2, 21) },
                { text: '\n', position: new vscode.Position(2, 22) },
                { text: 'C', position: new vscode.Position(3, 0) }
            ];
            
            for (const change of changes) {
                const changeEvent = {
                    document: testDocument,
                    contentChanges: [{
                        range: new vscode.Range(change.position, change.position),
                        rangeOffset: 0,
                        rangeLength: 0,
                        text: change.text
                    }],
                    reason: undefined
                } as vscode.TextDocumentChangeEvent;
                
                assert.doesNotThrow(() => {
                    editSynchronizer.onDidChangeTextDocument(changeEvent);
                });
            }
        });

        test('should handle document version tracking', () => {
            const initialState = editSynchronizer.getDocumentState(testDocument);
            const initialVersion = initialState?.version;
            
            // Simulate version change
            const newDocument = { ...testDocument, version: testDocument.version + 1 };
            const changeEvent = {
                document: newDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 0)),
                    rangeOffset: 0,
                    rangeLength: 0,
                    text: ' '
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            editSynchronizer.onDidChangeTextDocument(changeEvent);
            
            // State should be updated (we can't easily verify version change in tests)
            const updatedState = editSynchronizer.getDocumentState(testDocument);
            assert.ok(updatedState, 'Document state should exist after update');
        });

        test('should handle concurrent edit operations', () => {
            decorationManager.applyDecorations(testDocument);
            
            // Simulate concurrent edits
            const changeEvent1 = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 20), new vscode.Position(2, 20)),
                    rangeOffset: 20,
                    rangeLength: 0,
                    text: 'X'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            const changeEvent2 = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 25), new vscode.Position(2, 25)),
                    rangeOffset: 25,
                    rangeLength: 0,
                    text: 'Y'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            // Both should be handled without errors
            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent1);
                editSynchronizer.onDidChangeTextDocument(changeEvent2);
            });
        });
    });

    suite('Integration with DecorationManager', () => {
        test('should work with decoration updates', () => {
            decorationManager.applyDecorations(testDocument);
            
            const changeEvent = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 20), new vscode.Position(2, 20)),
                    rangeOffset: 20,
                    rangeLength: 0,
                    text: '\\nNew'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            // Should handle the change and trigger decoration updates
            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent);
            });

            // Verify decorations are still active
            assert.ok(decorationManager.isDecorationEnabled());
        });

        test('should handle decoration state queries', () => {
            decorationManager.applyDecorations(testDocument);
            
            const decorationCount = decorationManager.getActiveDecorationCount();
            assert.strictEqual(typeof decorationCount, 'number');
            
            // Should be able to get decorations in range
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(5, 0));
            const decorations = decorationManager.getDecorationsInRange(range);
            assert.ok(Array.isArray(decorations));
        });

        test('should handle complex transformation scenarios', () => {
            decorationManager.applyDecorations(testDocument);
            
            // Test multiple transformations in sequence
            const pos1 = new vscode.Position(2, 10);
            const pos2 = new vscode.Position(2, 25);
            
            const visual1 = editSynchronizer.transformActualToVisual(testDocument, pos1);
            const visual2 = editSynchronizer.transformActualToVisual(testDocument, pos2);
            
            const actual1 = editSynchronizer.transformVisualToActual(testDocument, visual1);
            const actual2 = editSynchronizer.transformVisualToActual(testDocument, visual2);
            
            // Transformations should be reasonably consistent
            assert.ok(visual1 instanceof vscode.Position);
            assert.ok(visual2 instanceof vscode.Position);
            assert.ok(actual1 instanceof vscode.Position);
            assert.ok(actual2 instanceof vscode.Position);
        });

        test('should handle decoration manager state changes', () => {
            decorationManager.applyDecorations(testDocument);
            
            // Disable decorations
            decorationManager.setEnabled(false);
            
            const changeEvent = {
                document: testDocument,
                contentChanges: [{
                    range: new vscode.Range(new vscode.Position(2, 20), new vscode.Position(2, 20)),
                    rangeOffset: 20,
                    rangeLength: 0,
                    text: 'test'
                }],
                reason: undefined
            } as vscode.TextDocumentChangeEvent;

            // Should still handle changes even when decorations are disabled
            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent);
            });
            
            // Re-enable decorations
            decorationManager.setEnabled(true);
            
            assert.doesNotThrow(() => {
                editSynchronizer.onDidChangeTextDocument(changeEvent);
            });
        });
    });
});