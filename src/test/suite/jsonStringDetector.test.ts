import * as assert from 'assert';
import * as vscode from 'vscode';
import { JsonStringDetector, StringRange, NewlinePosition, DetailedNewlinePosition, VisualPositionInfo } from '../../jsonStringDetector';

suite('JsonStringDetector Test Suite', () => {
    let detector: JsonStringDetector;

    setup(() => {
        detector = new JsonStringDetector();
    });

    suite('containsNewlines', () => {
        test('should return true for strings with \\n', () => {
            assert.strictEqual(detector.containsNewlines('Hello\\nWorld'), true);
            assert.strictEqual(detector.containsNewlines('Line 1\\nLine 2\\nLine 3'), true);
            assert.strictEqual(detector.containsNewlines('\\n'), true);
            assert.strictEqual(detector.containsNewlines('Start\\nMiddle\\nEnd'), true);
        });

        test('should return false for strings without \\n', () => {
            assert.strictEqual(detector.containsNewlines('Hello World'), false);
            assert.strictEqual(detector.containsNewlines(''), false);
            assert.strictEqual(detector.containsNewlines('\\t\\r\\\\'), false);
            assert.strictEqual(detector.containsNewlines('Just a normal string'), false);
        });

        test('should handle edge cases', () => {
            assert.strictEqual(detector.containsNewlines('\\\\n'), false); // Escaped backslash + n
            assert.strictEqual(detector.containsNewlines('n\\\\n'), false); // n + escaped backslash + n
            assert.strictEqual(detector.containsNewlines('\\n\\\\n'), true); // Has actual \\n
            assert.strictEqual(detector.containsNewlines('\\\\\\n'), true); // Escaped backslash + actual \n
        });
    });

    suite('findStringRanges', () => {
        async function createTestDocument(content: string): Promise<vscode.TextDocument> {
            const uri = vscode.Uri.parse('untitled:test.json');
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });
            return document;
        }

        test('should find simple string ranges', async () => {
            const content = '{"name": "John", "message": "Hello\\nWorld"}';
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 4); // "name", "John", "message", "Hello\\nWorld"
            
            // Check that we find the expected strings
            const stringContents = ranges.map(r => r.content);
            assert.ok(stringContents.includes('name'));
            assert.ok(stringContents.includes('John'));
            assert.ok(stringContents.includes('message'));
            assert.ok(stringContents.includes('Hello\\nWorld'));
            
            // Check which ones have newlines
            const withNewlines = ranges.filter(r => r.hasNewlines);
            assert.strictEqual(withNewlines.length, 1);
            assert.strictEqual(withNewlines[0].content, 'Hello\\nWorld');
        });

        test('should handle nested objects', async () => {
            const content = `{
                "user": {
                    "name": "Alice",
                    "bio": "Software developer\\nLoves coding"
                },
                "settings": {
                    "theme": "dark"
                }
            }`;
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 8); // All keys and values
            
            const stringContents = ranges.map(r => r.content);
            assert.ok(stringContents.includes('user'));
            assert.ok(stringContents.includes('name'));
            assert.ok(stringContents.includes('Alice'));
            assert.ok(stringContents.includes('bio'));
            assert.ok(stringContents.includes('Software developer\\nLoves coding'));
            assert.ok(stringContents.includes('settings'));
            assert.ok(stringContents.includes('theme'));
            assert.ok(stringContents.includes('dark'));
            
            // Check which ones have newlines
            const withNewlines = ranges.filter(r => r.hasNewlines);
            assert.strictEqual(withNewlines.length, 1);
            assert.strictEqual(withNewlines[0].content, 'Software developer\\nLoves coding');
        });

        test('should handle arrays with strings', async () => {
            const content = `{
                "messages": [
                    "First message",
                    "Second\\nmessage",
                    "Third message"
                ]
            }`;
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 4); // "messages" + 3 array elements
            
            const withNewlines = ranges.filter(r => r.hasNewlines);
            assert.strictEqual(withNewlines.length, 1);
            assert.strictEqual(withNewlines[0].content, 'Second\\nmessage');
        });

        test('should handle escaped quotes in strings', async () => {
            const content = '{"quote": "He said \\"Hello\\nWorld\\""}';
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 2);
            assert.strictEqual(ranges[1].content, 'He said \\"Hello\\nWorld\\"');
            assert.strictEqual(ranges[1].hasNewlines, true);
        });

        test('should handle multiple escape sequences', async () => {
            const content = '{"text": "Line 1\\nLine 2\\tTabbed\\nLine 3\\r\\nWindows line"}';
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 2);
            assert.strictEqual(ranges[1].hasNewlines, true);
            assert.strictEqual(ranges[1].content, 'Line 1\\nLine 2\\tTabbed\\nLine 3\\r\\nWindows line');
        });

        test('should return empty array for malformed JSON', async () => {
            const content = '{"name": "John", "incomplete": ';
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 0);
        });

        test('should handle empty JSON object', async () => {
            const content = '{}';
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 0);
        });

        test('should handle JSON with only numbers and booleans', async () => {
            const content = '{"count": 42, "active": true, "ratio": 3.14}';
            const document = await createTestDocument(content);
            
            const ranges = detector.findStringRanges(document);
            
            assert.strictEqual(ranges.length, 3); // Only the keys
            ranges.forEach(range => {
                assert.strictEqual(range.hasNewlines, false);
            });
        });
    });

    suite('extractNewlinePositions', () => {
        async function createTestDocument(content: string): Promise<vscode.TextDocument> {
            const uri = vscode.Uri.parse('untitled:test.json');
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });
            return document;
        }

        test('should extract newline positions from simple JSON', async () => {
            const content = '{"message": "Hello\\nWorld"}';
            const document = await createTestDocument(content);
            
            const positions = detector.extractNewlinePositions(document);
            
            assert.strictEqual(positions.length, 1);
            assert.strictEqual(positions[0].stringRange.content, 'Hello\\nWorld');
            
            // The \\n should be at position after "Hello"
            const expectedOffset = content.indexOf('\\n');
            const expectedPosition = document.positionAt(expectedOffset);
            assert.strictEqual(positions[0].position.line, expectedPosition.line);
            assert.strictEqual(positions[0].position.character, expectedPosition.character);
        });

        test('should extract multiple newline positions', async () => {
            const content = '{"text": "Line 1\\nLine 2\\nLine 3"}';
            const document = await createTestDocument(content);
            
            const positions = detector.extractNewlinePositions(document);
            
            assert.strictEqual(positions.length, 2);
            
            // Both should reference the same string range
            assert.strictEqual(positions[0].stringRange.content, 'Line 1\\nLine 2\\nLine 3');
            assert.strictEqual(positions[1].stringRange.content, 'Line 1\\nLine 2\\nLine 3');
            
            // Positions should be different
            assert.notStrictEqual(positions[0].position.character, positions[1].position.character);
        });

        test('should handle multiple strings with newlines', async () => {
            const content = `{
                "first": "Hello\\nWorld",
                "second": "Foo\\nBar\\nBaz"
            }`;
            const document = await createTestDocument(content);
            
            const positions = detector.extractNewlinePositions(document);
            
            assert.strictEqual(positions.length, 3); // 1 from first, 2 from second
            
            // Group by string content
            const firstStringPositions = positions.filter(p => p.stringRange.content === 'Hello\\nWorld');
            const secondStringPositions = positions.filter(p => p.stringRange.content === 'Foo\\nBar\\nBaz');
            
            assert.strictEqual(firstStringPositions.length, 1);
            assert.strictEqual(secondStringPositions.length, 2);
        });

        test('should return empty array when no newlines exist', async () => {
            const content = '{"name": "John", "age": 30}';
            const document = await createTestDocument(content);
            
            const positions = detector.extractNewlinePositions(document);
            
            assert.strictEqual(positions.length, 0);
        });

        test('should handle malformed JSON gracefully', async () => {
            const content = '{"incomplete": "Hello\\nWorld"';
            const document = await createTestDocument(content);
            
            const positions = detector.extractNewlinePositions(document);
            
            assert.strictEqual(positions.length, 0);
        });
    });

    suite('getStringRangeAtPosition', () => {
        async function createTestDocument(content: string): Promise<vscode.TextDocument> {
            const uri = vscode.Uri.parse('untitled:test.json');
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });
            return document;
        }

        test('should return string range when position is within string', async () => {
            const content = '{"message": "Hello World"}';
            const document = await createTestDocument(content);
            
            // Position within "Hello World" string
            const position = new vscode.Position(0, 15); // Should be within the string
            const range = detector.getStringRangeAtPosition(document, position);
            
            assert.ok(range !== null);
            assert.strictEqual(range!.content, 'Hello World');
        });

        test('should return null when position is outside strings', async () => {
            const content = '{"message": "Hello World"}';
            const document = await createTestDocument(content);
            
            // Position in the key area
            const position = new vscode.Position(0, 5); // Should be within "message" key
            const range = detector.getStringRangeAtPosition(document, position);
            
            // This should actually return the key string range
            assert.ok(range !== null);
            assert.strictEqual(range!.content, 'message');
        });

        test('should return null for positions in JSON structure', async () => {
            const content = '{"message": "Hello World"}';
            const document = await createTestDocument(content);
            
            // Position at the colon
            const position = new vscode.Position(0, 10);
            const range = detector.getStringRangeAtPosition(document, position);
            
            assert.strictEqual(range, null);
        });
    });

    suite('Position Tracking', () => {
        async function createTestDocument(content: string): Promise<vscode.TextDocument> {
            const uri = vscode.Uri.parse('untitled:test.json');
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });
            return document;
        }

        test('should convert between positions and offsets correctly', async () => {
            const content = '{"message": "Hello\\nWorld"}';
            const document = await createTestDocument(content);
            
            // Test position to offset conversion
            const position = new vscode.Position(0, 10);
            const offset = detector.positionToOffset(document, position);
            assert.strictEqual(offset, 10);
            
            // Test offset to position conversion
            const backToPosition = detector.offsetToPosition(document, offset);
            assert.strictEqual(backToPosition.line, position.line);
            assert.strictEqual(backToPosition.character, position.character);
        });

        test('should provide detailed newline position information', async () => {
            const content = '{"text": "Line 1\\nLine 2\\nLine 3"}';
            const document = await createTestDocument(content);
            
            const detailedPositions = detector.getDetailedNewlinePositions(document);
            
            assert.strictEqual(detailedPositions.length, 2);
            
            // First newline
            const first = detailedPositions[0];
            assert.strictEqual(first.indexInString, 0);
            assert.strictEqual(first.beforeText, 'Line 1');
            assert.ok(first.afterText.startsWith('Line 2'));
            assert.strictEqual(first.stringRange.content, 'Line 1\\nLine 2\\nLine 3');
            
            // Second newline
            const second = detailedPositions[1];
            assert.strictEqual(second.indexInString, 1);
            assert.strictEqual(second.beforeText, 'Line 1\\nLine 2');
            assert.strictEqual(second.afterText, 'Line 3');
        });

        test('should calculate visual positions correctly', async () => {
            const content = '{"text": "Line 1\\nLine 2\\nLine 3"}';
            const document = await createTestDocument(content);
            
            const detailedPositions = detector.getDetailedNewlinePositions(document);
            
            // First newline visual position
            const firstVisual = detector.calculateVisualPosition(document, detailedPositions[0]);
            assert.strictEqual(firstVisual.visualLine, 0);
            assert.strictEqual(firstVisual.visualCharacter, 6); // Length of "Line 1"
            assert.strictEqual(firstVisual.totalVisualLines, 3);
            assert.strictEqual(firstVisual.currentLineContent, 'Line 1');
            assert.strictEqual(firstVisual.isLastNewlineInString, false);
            
            // Second newline visual position
            const secondVisual = detector.calculateVisualPosition(document, detailedPositions[1]);
            assert.strictEqual(secondVisual.visualLine, 1);
            assert.strictEqual(secondVisual.visualCharacter, 6); // Length of "Line 2"
            assert.strictEqual(secondVisual.totalVisualLines, 3);
            assert.strictEqual(secondVisual.currentLineContent, 'Line 2');
            assert.strictEqual(secondVisual.isLastNewlineInString, true);
        });

        test('should handle complex position tracking with multiple strings', async () => {
            const content = `{
                "first": "Hello\\nWorld",
                "second": "Foo\\nBar\\nBaz"
            }`;
            const document = await createTestDocument(content);
            
            const detailedPositions = detector.getDetailedNewlinePositions(document);
            
            assert.strictEqual(detailedPositions.length, 3);
            
            // Group by string content
            const firstStringPositions = detailedPositions.filter(p => p.stringRange.content === 'Hello\\nWorld');
            const secondStringPositions = detailedPositions.filter(p => p.stringRange.content === 'Foo\\nBar\\nBaz');
            
            assert.strictEqual(firstStringPositions.length, 1);
            assert.strictEqual(secondStringPositions.length, 2);
            
            // Check indexing within each string
            assert.strictEqual(firstStringPositions[0].indexInString, 0);
            assert.strictEqual(secondStringPositions[0].indexInString, 0);
            assert.strictEqual(secondStringPositions[1].indexInString, 1);
        });

        test('should handle position tracking with escaped sequences', async () => {
            const content = '{"text": "Line 1\\\\nNot newline\\nReal newline"}';
            const document = await createTestDocument(content);
            
            const detailedPositions = detector.getDetailedNewlinePositions(document);
            
            // Should only find one real newline (the last one)
            assert.strictEqual(detailedPositions.length, 1);
            
            const position = detailedPositions[0];
            assert.strictEqual(position.indexInString, 0);
            assert.strictEqual(position.beforeText, 'Line 1\\\\nNot newline');
            assert.strictEqual(position.afterText, 'Real newline');
        });

        test('should provide accurate offset calculations', async () => {
            const content = '{"message": "Hello\\nWorld"}';
            const document = await createTestDocument(content);
            
            const detailedPositions = detector.getDetailedNewlinePositions(document);
            assert.strictEqual(detailedPositions.length, 1);
            
            const position = detailedPositions[0];
            
            // The \n should be at the position after "Hello" within the string
            const expectedOffset = content.indexOf('\\n');
            assert.strictEqual(position.offset, expectedOffset);
            assert.strictEqual(position.endOffset, expectedOffset + 2);
            
            // Verify the positions match the offsets
            const calculatedPosition = document.positionAt(position.offset);
            assert.strictEqual(position.position.line, calculatedPosition.line);
            assert.strictEqual(position.position.character, calculatedPosition.character);
        });

        test('should handle multiline JSON with proper position tracking', async () => {
            const content = `{
    "title": "My Document",
    "content": "First paragraph\\nSecond paragraph\\n\\nThird paragraph"
}`;
            const document = await createTestDocument(content);
            
            const detailedPositions = detector.getDetailedNewlinePositions(document);
            
            // Should find 3 newlines in the content string
            assert.strictEqual(detailedPositions.length, 3);
            
            // All should be from the same string
            detailedPositions.forEach(pos => {
                assert.strictEqual(pos.stringRange.content, 'First paragraph\\nSecond paragraph\\n\\nThird paragraph');
            });
            
            // Check the sequence of indices
            assert.strictEqual(detailedPositions[0].indexInString, 0);
            assert.strictEqual(detailedPositions[1].indexInString, 1);
            assert.strictEqual(detailedPositions[2].indexInString, 2);
            
            // Check visual positions
            const visual0 = detector.calculateVisualPosition(document, detailedPositions[0]);
            const visual1 = detector.calculateVisualPosition(document, detailedPositions[1]);
            const visual2 = detector.calculateVisualPosition(document, detailedPositions[2]);
            
            assert.strictEqual(visual0.visualLine, 0);
            assert.strictEqual(visual1.visualLine, 1);
            assert.strictEqual(visual2.visualLine, 2);
            
            assert.strictEqual(visual0.currentLineContent, 'First paragraph');
            assert.strictEqual(visual1.currentLineContent, 'Second paragraph');
            assert.strictEqual(visual2.currentLineContent, '');
        });
    });
});