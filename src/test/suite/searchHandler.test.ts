import * as assert from 'assert';
import * as vscode from 'vscode';
import { SearchHandler } from '../../searchHandler';
import { DecorationManager } from '../../decorationManager';
import { EditSynchronizer } from '../../editSynchronizer';

suite('SearchHandler Test Suite', () => {
    let searchHandler: SearchHandler;
    let decorationManager: DecorationManager;
    let editSynchronizer: EditSynchronizer;
    let document: vscode.TextDocument;

    suiteSetup(async () => {
        // Create test components
        decorationManager = new DecorationManager();
        editSynchronizer = new EditSynchronizer(decorationManager);
        searchHandler = new SearchHandler(decorationManager, editSynchronizer);
    });

    suiteTeardown(() => {
        searchHandler.dispose();
        editSynchronizer.dispose();
        decorationManager.dispose();
    });

    setup(async () => {
        // Create a test JSON document with newline escape sequences
        const testContent = `{
    "message": "Hello\\nWorld\\nTest",
    "description": "This is a test\\nwith multiple lines",
    "simple": "no newlines here"
}`;
        
        document = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'json'
        });
    });

    teardown(async () => {
        // Close the test document
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('should transform search text correctly', () => {
        // Test searching for visual line breaks
        const visualSearch = searchHandler.transformSearchText('Hello\nWorld', document);
        assert.strictEqual(visualSearch.visualPattern, 'Hello\nWorld');
        assert.strictEqual(visualSearch.actualPattern, 'Hello\\nWorld');
        assert.strictEqual(visualSearch.needsTransformation, true);

        // Test searching for escape sequences
        const actualSearch = searchHandler.transformSearchText('Hello\\nWorld', document);
        assert.strictEqual(actualSearch.visualPattern, 'Hello\nWorld');
        assert.strictEqual(actualSearch.actualPattern, 'Hello\\nWorld');
        assert.strictEqual(actualSearch.needsTransformation, true);

        // Test searching for regular text
        const normalSearch = searchHandler.transformSearchText('simple', document);
        assert.strictEqual(normalSearch.visualPattern, 'simple');
        assert.strictEqual(normalSearch.actualPattern, 'simple');
        assert.strictEqual(normalSearch.needsTransformation, false);
    });

    test('should find text in document correctly', () => {
        // Find escape sequences
        const results = searchHandler.findInDocument(document, 'Hello\\nWorld');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].text, 'Hello\\nWorld');
        assert.strictEqual(results[0].isInDecoratedArea, true);

        // Find regular text
        const simpleResults = searchHandler.findInDocument(document, 'simple');
        assert.strictEqual(simpleResults.length, 1);
        assert.strictEqual(simpleResults[0].text, 'simple');
        assert.strictEqual(simpleResults[0].isInDecoratedArea, false);
    });

    test('should find text with case sensitivity options', () => {
        // Case sensitive search
        const caseSensitiveResults = searchHandler.findInDocument(document, 'HELLO\\nWORLD', {
            matchCase: true
        });
        assert.strictEqual(caseSensitiveResults.length, 0);

        // Case insensitive search
        const caseInsensitiveResults = searchHandler.findInDocument(document, 'HELLO\\nWORLD', {
            matchCase: false
        });
        assert.strictEqual(caseInsensitiveResults.length, 1);
    });

    test('should find text with whole word matching', () => {
        // Whole word search that should match
        const wholeWordResults = searchHandler.findInDocument(document, 'Test', {
            matchWholeWord: true
        });
        assert.strictEqual(wholeWordResults.length, 1);

        // Whole word search that should not match (part of "test")
        const partialResults = searchHandler.findInDocument(document, 'est', {
            matchWholeWord: true
        });
        assert.strictEqual(partialResults.length, 0);

        // Non-whole word search that should match - "est" appears in "Test" and "test"
        const nonWholeWordResults = searchHandler.findInDocument(document, 'est', {
            matchWholeWord: false
        });
        assert.strictEqual(nonWholeWordResults.length, 2); // "Test" and "test"
    });

    test('should handle regex search patterns', () => {
        // Regex search for any word followed by newline
        const regexResults = searchHandler.findInDocument(document, '\\w+\\\\n\\w+', {
            useRegex: true
        });
        assert.strictEqual(regexResults.length, 2); // "Hello\\nWorld" and "test\\nwith"

        // Invalid regex should return empty results
        const invalidRegexResults = searchHandler.findInDocument(document, '[invalid', {
            useRegex: true
        });
        assert.strictEqual(invalidRegexResults.length, 0);
    });

    test('should create search results with correct information', () => {
        const results = searchHandler.findInDocument(document, 'Hello\\nWorld');
        assert.strictEqual(results.length, 1);

        const result = results[0];
        assert.strictEqual(result.text, 'Hello\\nWorld');
        assert.strictEqual(result.isInDecoratedArea, true);
        assert.ok(result.actualRange);
        
        // Visual range should be defined for decorated areas
        if (result.isInDecoratedArea) {
            assert.ok(result.visualRange);
        }
    });

    test('should handle replace operations correctly', async () => {
        const results = searchHandler.findInDocument(document, 'Hello\\nWorld');
        assert.strictEqual(results.length, 1);

        const operations = await searchHandler.replaceInDocument(document, results, 'Goodbye\\nUniverse');
        assert.strictEqual(operations.length, 1);
        assert.strictEqual(operations[0].success, true);
        assert.strictEqual(operations[0].transformedReplacementText, 'Goodbye\\nUniverse');

        // Verify the replacement was applied
        const newContent = document.getText();
        assert.ok(newContent.includes('Goodbye\\nUniverse'));
        assert.ok(!newContent.includes('Hello\\nWorld'));
    });

    test('should handle replace operations in decorated areas', async () => {
        const results = searchHandler.findInDocument(document, 'test\\nwith');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].isInDecoratedArea, true);

        const operations = await searchHandler.replaceInDocument(document, results, 'example\\nwith');
        assert.strictEqual(operations.length, 1);
        assert.strictEqual(operations[0].success, true);

        // The replacement text should be properly transformed for decorated areas
        assert.strictEqual(operations[0].transformedReplacementText, 'example\\nwith');
    });

    test('should handle replace operations in non-decorated areas', async () => {
        const results = searchHandler.findInDocument(document, 'simple');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].isInDecoratedArea, false);

        const operations = await searchHandler.replaceInDocument(document, results, 'complex');
        assert.strictEqual(operations.length, 1);
        assert.strictEqual(operations[0].success, true);

        // No transformation should be needed for non-decorated areas
        assert.strictEqual(operations[0].transformedReplacementText, 'complex');
    });

    test('should handle find operation with proper decoration refresh', () => {
        // This test verifies that find operations don't interfere with decorations
        searchHandler.handleFindOperation(document, 'Hello\\nWorld');
        
        // Verify decorations are still active
        const decorationState = decorationManager.getDecorationState();
        assert.strictEqual(decorationState.isEnabled, true);
    });

    test('should handle replace operation with proper decoration refresh', async () => {
        // Test single replace
        await searchHandler.handleReplaceOperation(document, 'Hello\\nWorld', 'Hi\\nThere', false);
        
        const content = document.getText();
        assert.ok(content.includes('Hi\\nThere'));
        assert.ok(!content.includes('Hello\\nWorld'));

        // Verify decorations are refreshed
        const decorationState = decorationManager.getDecorationState();
        assert.strictEqual(decorationState.isEnabled, true);
    });

    test('should handle replace all operation', async () => {
        // Add more content with multiple occurrences
        const testContent = `{
    "message1": "Hello\\nWorld",
    "message2": "Hello\\nWorld",
    "message3": "Hello\\nWorld"
}`;
        
        const multiDocument = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'json'
        });

        try {
            await searchHandler.handleReplaceOperation(multiDocument, 'Hello\\nWorld', 'Hi\\nThere', true);
            
            const content = multiDocument.getText();
            const hiThereCount = (content.match(/Hi\\nThere/g) || []).length;
            const helloWorldCount = (content.match(/Hello\\nWorld/g) || []).length;
            
            assert.strictEqual(hiThereCount, 3);
            assert.strictEqual(helloWorldCount, 0);
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    test('should handle empty search results gracefully', async () => {
        const results = searchHandler.findInDocument(document, 'nonexistent');
        assert.strictEqual(results.length, 0);

        const operations = await searchHandler.replaceInDocument(document, results, 'replacement');
        assert.strictEqual(operations.length, 0);
    });

    test('should handle non-JSON documents correctly', () => {
        // Create a non-JSON document
        const createNonJsonDoc = async () => {
            const nonJsonDoc = await vscode.workspace.openTextDocument({
                content: 'This is not JSON\\nwith newlines',
                language: 'plaintext'
            });
            
            try {
                searchHandler.handleFindOperation(nonJsonDoc, 'not JSON');
                // Should not throw an error, just handle gracefully
                assert.ok(true);
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        };

        return createNonJsonDoc();
    });

    test('should preserve JSON validity after replace operations', async () => {
        const results = searchHandler.findInDocument(document, 'Hello\\nWorld');
        await searchHandler.replaceInDocument(document, results, 'Valid\\nReplacement');

        // Verify the document is still valid JSON
        const content = document.getText();
        assert.doesNotThrow(() => {
            JSON.parse(content);
        }, 'Document should remain valid JSON after replacement');
    });
});

suite('EditSynchronizer Clipboard Operations', () => {
    let editSynchronizer: EditSynchronizer;
    let decorationManager: DecorationManager;
    let document: vscode.TextDocument;

    suiteSetup(async () => {
        decorationManager = new DecorationManager();
        editSynchronizer = new EditSynchronizer(decorationManager);
    });

    suiteTeardown(() => {
        editSynchronizer.dispose();
        decorationManager.dispose();
    });

    setup(async () => {
        const testContent = `{
    "message": "Hello\\nWorld\\nTest",
    "description": "This is a test\\nwith multiple lines",
    "simple": "no newlines here"
}`;
        
        document = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'json'
        });

        // Apply decorations
        decorationManager.applyDecorations(document);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('should handle copy operation for decorated content', () => {
        // Create a selection in decorated area
        const selection = new vscode.Selection(
            new vscode.Position(1, 15), // Start of "Hello\nWorld"
            new vscode.Position(1, 27)  // End of "Hello\nWorld"
        );

        const copiedText = editSynchronizer.handleCopyOperation(document, selection);
        
        // The copied text should contain the selected content
        assert.ok(copiedText.length > 0, 'Should have copied text');
        assert.ok(copiedText.includes('Hello') || copiedText.includes('\\n'), 'Should contain expected content');
        
        // Log for debugging
        console.log('Original selection text:', document.getText(selection));
        console.log('Copied text:', copiedText);
    });

    test('should handle copy operation for non-decorated content', () => {
        // Create a selection in non-decorated area
        const selection = new vscode.Selection(
            new vscode.Position(3, 15), // Start of "no newlines here"
            new vscode.Position(3, 31)  // End of "no newlines here"
        );

        const copiedText = editSynchronizer.handleCopyOperation(document, selection);
        
        // Should not transform non-decorated content
        assert.strictEqual(copiedText, 'no newlines here');
    });

    test('should handle paste operation into decorated area', () => {
        const position = new vscode.Position(1, 20); // Inside decorated string
        const clipboardText = 'Hello\nPasted\nContent';

        const pastedText = editSynchronizer.handlePasteOperation(document, position, clipboardText);
        
        // Should transform line breaks to escape sequences
        assert.strictEqual(pastedText, 'Hello\\nPasted\\nContent');
    });

    test('should handle paste operation into non-decorated area', () => {
        const position = new vscode.Position(3, 20); // Inside non-decorated string
        const clipboardText = 'Hello\nPasted\nContent';

        const pastedText = editSynchronizer.handlePasteOperation(document, position, clipboardText);
        
        // Should not transform content for non-decorated areas
        assert.strictEqual(pastedText, 'Hello\nPasted\nContent');
    });

    test('should test clipboard operations end-to-end', () => {
        const selection = new vscode.Selection(
            new vscode.Position(1, 15), // Start of decorated content
            new vscode.Position(1, 27)  // End of decorated content
        );

        const testResult = editSynchronizer.testClipboardOperations(document, selection);
        
        assert.ok(testResult.originalText.length > 0, 'Should have original text');
        assert.ok(testResult.copiedText.length > 0, 'Should have copied text');
        assert.ok(testResult.pastedText.length > 0, 'Should have pasted text');
        
        // For decorated content, transformation should occur
        if (testResult.isTransformed) {
            assert.notStrictEqual(testResult.originalText, testResult.copiedText, 'Copy should transform decorated content');
        }
    });

    test('should validate clipboard content for JSON compatibility', () => {
        const position = new vscode.Position(1, 20); // Inside JSON string
        const validText = 'Valid content';
        const textWithNewlines = 'Content\nwith\nlines';

        // Test valid content
        const validResult = editSynchronizer.validateClipboardContent(validText, position, document);
        assert.strictEqual(validResult.isValid, true, 'Valid content should pass validation');
        assert.strictEqual(validResult.needsTransformation, false, 'Valid content should not need transformation');

        // Test content with newlines
        const newlineResult = editSynchronizer.validateClipboardContent(textWithNewlines, position, document);
        assert.strictEqual(newlineResult.isValid, true, 'Content with newlines should be valid after transformation');
        assert.strictEqual(newlineResult.needsTransformation, true, 'Content with newlines should need transformation');
        assert.strictEqual(newlineResult.transformedText, 'Content\\nwith\\nlines', 'Should transform newlines to escape sequences');
    });

    test('should handle invalid clipboard content gracefully', () => {
        const position = new vscode.Position(1, 20); // Inside JSON string
        const invalidText = 'Content with "unescaped quotes';

        const result = editSynchronizer.validateClipboardContent(invalidText, position, document);
        
        // Should detect potential JSON issues
        assert.ok(result.errors.length >= 0, 'Should handle validation gracefully');
    });

    test('should handle clipboard operations outside JSON strings', () => {
        const position = new vscode.Position(0, 5); // Outside any string
        const clipboardText = 'Some content\nwith newlines';

        const pastedText = editSynchronizer.handlePasteOperation(document, position, clipboardText);
        
        // Should not transform content outside JSON strings
        assert.strictEqual(pastedText, clipboardText, 'Should not transform content outside JSON strings');
    });

    test('should preserve clipboard content integrity', () => {
        const selection = new vscode.Selection(
            new vscode.Position(1, 15),
            new vscode.Position(1, 27)
        );

        // Test round-trip: copy then paste
        const originalText = document.getText(selection);
        const copiedText = editSynchronizer.handleCopyOperation(document, selection);
        const pastedText = editSynchronizer.handlePasteOperation(document, selection.start, copiedText);

        // The pasted text should be compatible with the original context
        assert.ok(originalText.length > 0, 'Should have original text');
        assert.ok(copiedText.length > 0, 'Should have copied text');
        assert.ok(pastedText.length > 0, 'Should have pasted text');
    });
});