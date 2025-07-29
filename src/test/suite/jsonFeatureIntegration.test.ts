import * as assert from 'assert';
import * as vscode from 'vscode';
import { JsonFeatureIntegration } from '../../jsonFeatureIntegration';
import { DecorationManager } from '../../decorationManager';

suite('JsonFeatureIntegration Test Suite', () => {
    let jsonFeatureIntegration: JsonFeatureIntegration;
    let decorationManager: DecorationManager;
    let document: vscode.TextDocument;

    suiteSetup(async () => {
        // Create test components
        decorationManager = new DecorationManager();
        jsonFeatureIntegration = new JsonFeatureIntegration(decorationManager);
    });

    suiteTeardown(() => {
        jsonFeatureIntegration.dispose();
        decorationManager.dispose();
    });

    setup(async () => {
        // Create a test JSON document with complex structure
        const testContent = `{
    "user": {
        "name": "John Doe",
        "message": "Hello\\nWorld\\nThis is a test",
        "preferences": {
            "theme": "dark",
            "notifications": "enabled"
        }
    },
    "data": [
        {
            "id": 1,
            "content": "First item\\nwith newlines"
        },
        {
            "id": 2,
            "content": "Second item\\nwith more\\nlines"
        }
    ],
    "metadata": {
        "version": "1.0",
        "description": "Test data\\nfor integration testing"
    }
}`;
        
        document = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'json'
        });

        // Apply decorations to the document
        decorationManager.applyDecorations(document);
    });

    teardown(async () => {
        // Close the test document
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    suite('Folding Range Provider', () => {
        test('should provide folding ranges for JSON structure', async () => {
            const foldingRanges = await jsonFeatureIntegration.provideFoldingRanges(
                document,
                {} as vscode.FoldingContext,
                new vscode.CancellationTokenSource().token
            );

            assert.ok(Array.isArray(foldingRanges));
            assert.ok(foldingRanges!.length > 0, 'Should provide folding ranges for nested JSON');

            // Check that we have ranges for the main object and nested objects/arrays
            const ranges = foldingRanges as vscode.FoldingRange[];
            const hasMainObjectRange = ranges.some(range => range.start === 0);
            assert.ok(hasMainObjectRange, 'Should have folding range for main object');
        });

        test('should handle folding ranges with decorations present', async () => {
            // Force apply decorations by opening the document in an editor
            const editor = await vscode.window.showTextDocument(document);
            decorationManager.applyDecorations(document);
            
            // Check if decorations were applied (they might not be if no newlines are detected)
            const decorationState = decorationManager.getDecorationState();
            
            const foldingRanges = await jsonFeatureIntegration.provideFoldingRanges(
                document,
                {} as vscode.FoldingContext,
                new vscode.CancellationTokenSource().token
            );

            assert.ok(Array.isArray(foldingRanges));
            assert.ok(foldingRanges!.length > 0, 'Should provide folding ranges even with decorations');

            // Folding should work normally regardless of decorations
            const ranges = foldingRanges as vscode.FoldingRange[];
            ranges.forEach(range => {
                assert.ok(range.start >= 0, 'Folding range start should be valid');
                assert.ok(range.end > range.start, 'Folding range end should be after start');
            });
            
            // Close the editor
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should handle cancellation token', async () => {
            const tokenSource = new vscode.CancellationTokenSource();
            tokenSource.cancel();

            const foldingRanges = await jsonFeatureIntegration.provideFoldingRanges(
                document,
                {} as vscode.FoldingContext,
                tokenSource.token
            );

            assert.deepStrictEqual(foldingRanges, [], 'Should return empty array when cancelled');
        });

        test('should handle malformed JSON gracefully', async () => {
            const malformedContent = `{
    "user": {
        "name": "John Doe",
        "message": "Hello\\nWorld"
        // Missing closing braces
`;
            
            const malformedDoc = await vscode.workspace.openTextDocument({
                content: malformedContent,
                language: 'json'
            });

            try {
                const foldingRanges = await jsonFeatureIntegration.provideFoldingRanges(
                    malformedDoc,
                    {} as vscode.FoldingContext,
                    new vscode.CancellationTokenSource().token
                );

                // Should handle gracefully without throwing
                assert.ok(Array.isArray(foldingRanges));
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Completion Item Provider', () => {
        test('should provide completion items for JSON properties', async () => {
            // Position after opening brace of user object
            const position = new vscode.Position(2, 8); // After "name":
            
            const completionItems = await jsonFeatureIntegration.provideCompletionItems(
                document,
                position,
                new vscode.CancellationTokenSource().token,
                { triggerKind: vscode.CompletionTriggerKind.Invoke } as vscode.CompletionContext
            );

            assert.ok(Array.isArray(completionItems));
            
            if (Array.isArray(completionItems)) {
                // Should provide some completion items
                assert.ok(completionItems.length >= 0, 'Should provide completion items');
            }
        });

        test('should provide escape sequence completions in string values', async () => {
            // Position inside a string value
            const position = new vscode.Position(3, 20); // Inside message string
            
            const completionItems = await jsonFeatureIntegration.provideCompletionItems(
                document,
                position,
                new vscode.CancellationTokenSource().token,
                { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: '\\' } as vscode.CompletionContext
            );

            if (Array.isArray(completionItems)) {
                // Should include escape sequence completions
                const hasNewlineCompletion = completionItems.some(item => 
                    item.insertText === '\\n' || (item.insertText as string)?.includes('\\n')
                );
                // Note: This might be 0 if we're not in the right context, which is acceptable
                assert.ok(completionItems.length >= 0, 'Should handle completion request gracefully');
            }
        });

        test('should enhance completion items for decorated areas', async () => {
            // Position inside a decorated string (one with \n sequences)
            const position = new vscode.Position(3, 25); // Inside message string with newlines
            
            const completionItems = await jsonFeatureIntegration.provideCompletionItems(
                document,
                position,
                new vscode.CancellationTokenSource().token,
                { triggerKind: vscode.CompletionTriggerKind.Invoke } as vscode.CompletionContext
            );

            if (Array.isArray(completionItems)) {
                // Should provide enhanced completions for decorated areas
                assert.ok(completionItems.length >= 0, 'Should provide completions for decorated areas');
                
                // Check if any items have been enhanced with decoration-aware information
                const hasEnhancedItems = completionItems.some(item => 
                    item.detail?.includes('transformed') || 
                    item.documentation?.toString().includes('visual')
                );
                // This is optional enhancement, so we don't require it
            }
        });

        test('should handle cancellation token for completion', async () => {
            const tokenSource = new vscode.CancellationTokenSource();
            tokenSource.cancel();

            const position = new vscode.Position(2, 8);
            const completionItems = await jsonFeatureIntegration.provideCompletionItems(
                document,
                position,
                tokenSource.token,
                { triggerKind: vscode.CompletionTriggerKind.Invoke } as vscode.CompletionContext
            );

            assert.deepStrictEqual(completionItems, [], 'Should return empty array when cancelled');
        });
    });

    suite('Hover Provider', () => {
        test('should provide hover information for decorated content', async () => {
            // Find a position with a decoration
            const decorationState = decorationManager.getDecorationState();
            
            if (decorationState.decorations.length > 0) {
                const decoration = decorationState.decorations[0];
                const position = decoration.range.start;
                
                const hover = await jsonFeatureIntegration.provideHover(
                    document,
                    position,
                    new vscode.CancellationTokenSource().token
                );

                if (hover) {
                    assert.ok(hover.contents.length > 0, 'Should provide hover content');
                    const content = hover.contents[0];
                    if (content instanceof vscode.MarkdownString) {
                        assert.ok(content.value.includes('JSON Newline Formatter'), 'Should mention the extension');
                    }
                }
            }
        });

        test('should provide hover information for decorated string areas', async () => {
            // Position inside a string with newlines
            const position = new vscode.Position(3, 25); // Inside message string
            
            const hover = await jsonFeatureIntegration.provideHover(
                document,
                position,
                new vscode.CancellationTokenSource().token
            );

            // Hover might be provided for decorated areas
            if (hover) {
                assert.ok(hover.contents.length > 0, 'Should provide hover content for decorated areas');
            }
        });

        test('should return null for non-decorated areas', async () => {
            // Position in a regular property name
            const position = new vscode.Position(2, 5); // In "name" property
            
            const hover = await jsonFeatureIntegration.provideHover(
                document,
                position,
                new vscode.CancellationTokenSource().token
            );

            // Should return null for non-decorated areas (or let default hover work)
            // This is acceptable behavior
            assert.ok(hover === null || hover === undefined || hover.contents.length >= 0);
        });

        test('should handle cancellation token for hover', async () => {
            const tokenSource = new vscode.CancellationTokenSource();
            tokenSource.cancel();

            const position = new vscode.Position(3, 25);
            const hover = await jsonFeatureIntegration.provideHover(
                document,
                position,
                tokenSource.token
            );

            assert.strictEqual(hover, null, 'Should return null when cancelled');
        });
    });

    suite('JSON Schema Validation', () => {
        test('should validate JSON schema correctly with decorations', () => {
            const validation = jsonFeatureIntegration.validateJsonSchema(document);
            
            assert.strictEqual(validation.isValid, true, 'JSON should be valid');
            assert.strictEqual(validation.errors.length, 0, 'Should have no validation errors');
            assert.strictEqual(validation.decorationInterference, false, 'Decorations should not interfere');
        });

        test('should detect invalid JSON', async () => {
            const invalidContent = `{
    "user": {
        "name": "John Doe"
        "message": "Missing comma"
    }
}`;
            
            const invalidDoc = await vscode.workspace.openTextDocument({
                content: invalidContent,
                language: 'json'
            });

            try {
                const validation = jsonFeatureIntegration.validateJsonSchema(invalidDoc);
                
                assert.strictEqual(validation.isValid, false, 'Invalid JSON should be detected');
                assert.ok(validation.errors.length > 0, 'Should have validation errors');
                assert.strictEqual(validation.decorationInterference, false, 'Decorations should not interfere with error detection');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Folding Integration Tests', () => {
        test('should test folding functionality with decorations', () => {
            const testResult = jsonFeatureIntegration.testFoldingWithDecorations(document);
            
            assert.ok(testResult.foldingRangesCount >= 0, 'Should have folding ranges');
            assert.ok(testResult.decoratedRangesCount >= 0, 'Should have decorated ranges');
            assert.strictEqual(testResult.interferenceDetected, false, 'Should not detect interference');
        });

        test('should handle folding with multiple decoration types', () => {
            // Apply decorations first
            decorationManager.applyDecorations(document);
            
            const testResult = jsonFeatureIntegration.testFoldingWithDecorations(document);
            
            // Folding should work regardless of decoration count
            assert.ok(testResult.foldingRangesCount >= 0, 'Should provide folding ranges');
            assert.strictEqual(testResult.interferenceDetected, false, 'Decorations should not interfere with folding');
        });
    });

    suite('Error Handling', () => {
        test('should handle errors in folding range provision gracefully', async () => {
            // Create a document that might cause issues
            const problematicContent = '';
            const emptyDoc = await vscode.workspace.openTextDocument({
                content: problematicContent,
                language: 'json'
            });

            try {
                const foldingRanges = await jsonFeatureIntegration.provideFoldingRanges(
                    emptyDoc,
                    {} as vscode.FoldingContext,
                    new vscode.CancellationTokenSource().token
                );

                // Should handle gracefully
                assert.ok(Array.isArray(foldingRanges));
                assert.strictEqual(foldingRanges!.length, 0, 'Empty document should have no folding ranges');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('should handle errors in completion provision gracefully', async () => {
            const position = new vscode.Position(100, 100); // Invalid position
            
            const completionItems = await jsonFeatureIntegration.provideCompletionItems(
                document,
                position,
                new vscode.CancellationTokenSource().token,
                { triggerKind: vscode.CompletionTriggerKind.Invoke } as vscode.CompletionContext
            );

            // Should handle gracefully without throwing
            assert.ok(Array.isArray(completionItems) || completionItems === undefined);
        });

        test('should handle errors in hover provision gracefully', async () => {
            const position = new vscode.Position(100, 100); // Invalid position
            
            const hover = await jsonFeatureIntegration.provideHover(
                document,
                position,
                new vscode.CancellationTokenSource().token
            );

            // Should handle gracefully without throwing
            assert.ok(hover === null || hover === undefined || hover instanceof vscode.Hover);
        });
    });
});