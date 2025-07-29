import * as assert from 'assert';
import * as vscode from 'vscode';
import { JsonStringDetector, JsonParsingResult } from '../../jsonStringDetector';
import { DecorationManager } from '../../decorationManager';

suite('Error Handling Tests', () => {
    let jsonDetector: JsonStringDetector;
    let decorationManager: DecorationManager;

    setup(() => {
        jsonDetector = new JsonStringDetector();
        decorationManager = new DecorationManager();
    });

    teardown(() => {
        decorationManager.dispose();
    });

    suite('JSON Parsing Error Handling', () => {
        test('should handle malformed JSON gracefully', async () => {
            const malformedJson = '{"name": "test", "invalid": }';
            const document = await vscode.workspace.openTextDocument({
                content: malformedJson,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.error);
            assert.strictEqual(result.stringRanges.length, 0);
        });

        test('should handle unterminated strings', async () => {
            const unterminatedString = '{"name": "test';
            const document = await vscode.workspace.openTextDocument({
                content: unterminatedString,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.error);
            assert.ok(result.error.includes('Unexpected end of JSON input') || result.error.includes('Unterminated'));
        });

        test('should handle unexpected tokens', async () => {
            const unexpectedToken = '{"name": test}'; // missing quotes around test
            const document = await vscode.workspace.openTextDocument({
                content: unexpectedToken,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.error);
            assert.ok(result.error.includes('Unexpected token') || result.error.includes('Invalid JSON syntax'));
        });

        test('should return empty string ranges for invalid JSON', async () => {
            const invalidJson = '{"name": "test", invalid}';
            const document = await vscode.workspace.openTextDocument({
                content: invalidJson,
                language: 'json'
            });

            const stringRanges = jsonDetector.findStringRanges(document);
            const newlinePositions = jsonDetector.extractNewlinePositions(document);
            const detailedPositions = jsonDetector.getDetailedNewlinePositions(document);

            assert.strictEqual(stringRanges.length, 0);
            assert.strictEqual(newlinePositions.length, 0);
            assert.strictEqual(detailedPositions.length, 0);
        });

        test('should handle valid JSON correctly', async () => {
            const validJson = '{"name": "test\\nvalue", "other": "normal"}';
            const document = await vscode.workspace.openTextDocument({
                content: validJson,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.error, undefined);
            assert.ok(result.stringRanges.length > 0);
            
            // Should find the string with newline
            const stringWithNewline = result.stringRanges.find(range => range.hasNewlines);
            assert.ok(stringWithNewline);
            assert.strictEqual(stringWithNewline.content, 'test\\nvalue');
        });
    });

    suite('Decoration Manager Error Handling', () => {
        test('should not apply decorations to invalid JSON', async () => {
            const invalidJson = '{"name": "test", invalid}';
            const document = await vscode.workspace.openTextDocument({
                content: invalidJson,
                language: 'json'
            });

            // Show the document in an editor
            const editor = await vscode.window.showTextDocument(document);

            // Try to apply decorations
            decorationManager.applyDecorations(document);

            // Should have no active decorations
            const decorationCount = decorationManager.getActiveDecorationCount();
            assert.strictEqual(decorationCount, 0);

            // Close the editor
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should handle decoration errors gracefully', async () => {
            const validJson = '{"name": "test\\nvalue"}';
            const document = await vscode.workspace.openTextDocument({
                content: validJson,
                language: 'json'
            });

            // Show the document in an editor
            const editor = await vscode.window.showTextDocument(document);

            // Apply decorations (should work normally)
            decorationManager.applyDecorations(document);

            // Should have decorations for the newline
            const decorationCount = decorationManager.getActiveDecorationCount();
            assert.ok(decorationCount > 0);

            // Close the editor
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('Edge Cases', () => {
        test('should handle empty JSON document', async () => {
            const emptyJson = '';
            const document = await vscode.workspace.openTextDocument({
                content: emptyJson,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.error);
            assert.strictEqual(result.stringRanges.length, 0);
        });

        test('should handle JSON with only whitespace', async () => {
            const whitespaceJson = '   \n  \t  ';
            const document = await vscode.workspace.openTextDocument({
                content: whitespaceJson,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.error);
            assert.strictEqual(result.stringRanges.length, 0);
        });

        test('should handle very large JSON documents', async () => {
            // Create a large JSON with many strings containing newlines
            const largeJsonParts = ['{"data": ['];
            for (let i = 0; i < 1000; i++) {
                largeJsonParts.push(`"item${i}\\nwith\\nnewlines"`);
                if (i < 999) largeJsonParts.push(',');
            }
            largeJsonParts.push(']}');
            const largeJson = largeJsonParts.join('');

            const document = await vscode.workspace.openTextDocument({
                content: largeJson,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            assert.ok(result.stringRanges.length > 0);
            
            // Should find strings with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.ok(stringsWithNewlines.length > 0);
        });

        test('should handle JSON with mixed escape sequences', async () => {
            const mixedEscapeJson = '{"text": "line1\\nline2\\tindented\\\"quoted\\\\backslash"}';
            const document = await vscode.workspace.openTextDocument({
                content: mixedEscapeJson,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.stringRanges.length, 2); // Key "text" and value string
            
            // Find the string range with newlines (the value, not the key)
            const stringWithNewlines = result.stringRanges.find(range => range.hasNewlines);
            assert.ok(stringWithNewlines);
            assert.strictEqual(stringWithNewlines.hasNewlines, true);
            assert.ok(stringWithNewlines.content.includes('\\n'));
            assert.ok(stringWithNewlines.content.includes('\\t'));
            assert.ok(stringWithNewlines.content.includes('\\"'));
            assert.ok(stringWithNewlines.content.includes('\\\\'));
        });
    });

    suite('Error Position Detection', () => {
        test('should detect error position for syntax errors', async () => {
            const jsonWithError = '{"name": "test", "value": }'; // missing value
            const document = await vscode.workspace.openTextDocument({
                content: jsonWithError,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.error);
            // Error position detection may vary by JSON parser implementation
            // Just verify that if position is provided, it's valid
            if (result.errorPosition) {
                assert.ok(result.errorPosition.line >= 0);
                assert.ok(result.errorPosition.character >= 0);
            }
        });

        test('should handle getStringRangeAtPosition with invalid JSON', async () => {
            const invalidJson = '{"name": "test", invalid}';
            const document = await vscode.workspace.openTextDocument({
                content: invalidJson,
                language: 'json'
            });

            const position = new vscode.Position(0, 10);
            const stringRange = jsonDetector.getStringRangeAtPosition(document, position);

            // Should return null for invalid JSON
            assert.strictEqual(stringRange, null);
        });
    });
});