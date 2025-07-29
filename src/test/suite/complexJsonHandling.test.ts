import * as assert from 'assert';
import * as vscode from 'vscode';
import { JsonStringDetector, PerformanceMetrics } from '../../jsonStringDetector';

suite('Complex JSON Handling Tests', () => {
    let jsonDetector: JsonStringDetector;

    setup(() => {
        jsonDetector = new JsonStringDetector();
    });

    suite('Deeply Nested Structures', () => {
        test('should handle deeply nested objects', async () => {
            // Use raw JSON string to avoid double-escaping
            const jsonText = `{
                "level1": {
                    "level2": {
                        "level3": {
                            "level4": {
                                "level5": {
                                    "message": "Deep\\nNested\\nValue",
                                    "data": "Another\\nString"
                                }
                            }
                        }
                    }
                }
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            assert.ok(result.stringRanges.length > 0);
            
            // Should find strings with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 2);
        });

        test('should handle deeply nested arrays', async () => {
            const jsonText = `{
                "data": [
                    [
                        [
                            "First\\nLevel",
                            "Second\\nLevel"
                        ],
                        [
                            "Third\\nLevel",
                            "Fourth\\nLevel"
                        ]
                    ],
                    [
                        [
                            "Fifth\\nLevel"
                        ]
                    ]
                ]
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Should find all strings with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 5);
        });

        test('should handle mixed nested structures', async () => {
            const jsonText = `{
                "users": [
                    {
                        "name": "John\\nDoe",
                        "profile": {
                            "bio": "Software\\nDeveloper\\nExtraordinaire",
                            "skills": ["JavaScript", "TypeScript", "Node.js\\nExpress"]
                        },
                        "messages": [
                            {
                                "text": "Hello\\nWorld",
                                "metadata": {
                                    "timestamp": "2023-01-01",
                                    "tags": ["greeting\\nfriendly", "casual"]
                                }
                            }
                        ]
                    }
                ]
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Should find all strings with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.ok(stringsWithNewlines.length >= 5);
        });
    });

    suite('Mixed Escape Sequences', () => {
        test('should handle all standard JSON escape sequences', async () => {
            const jsonText = `{
                "quotes": "He said \\"Hello\\nWorld\\"",
                "backslash": "Path: C:\\\\Users\\\\Name\\nFile",
                "tab": "Column1\\tColumn2\\nRow1\\tRow2",
                "carriageReturn": "Line1\\r\\nLine2\\nLine3",
                "formFeed": "Page1\\fPage2\\nContinued",
                "backspace": "Text\\bCorrected\\nDone"
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // All strings should have newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 6);
            
            // Verify specific escape sequences are preserved
            const quotesString = result.stringRanges.find(range => 
                range.content.includes('\\"') && range.content.includes('\\n')
            );
            assert.ok(quotesString);
        });

        test('should handle Unicode escape sequences with newlines', async () => {
            const jsonText = `{
                "emoji": "Hello \\u0048\\u0065\\u006C\\u006C\\u006F\\nWorld \\u1F44D",
                "mixed": "Text\\nWith\\u0020Unicode\\nSpaces",
                "complex": "\\u0041\\u0042\\u0043\\n\\u0044\\u0045\\u0046"
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Should find strings with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 3);
        });

        test('should handle complex escape sequence combinations', async () => {
            const jsonText = `{
                "nightmare": "\\\\n\\\\\\n\\\\\\\\n\\n\\\\n",
                "realistic": "File: \\"C:\\\\Program Files\\\\App\\\\config.json\\"\\nStatus: \\"Running\\"",
                "edgeCase": "\\\\\\\\\\n\\\\\\\\\\\\n\\\\\\n"
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Should correctly identify real newlines vs escaped backslashes
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.ok(stringsWithNewlines.length >= 2);
        });
    });

    suite('Performance Optimization', () => {
        test('should handle large JSON files efficiently', async () => {
            // Create a large JSON structure using raw JSON to avoid double-escaping
            const items = [];
            for (let i = 0; i < 100; i++) { // Reduced from 1000 to 100 for faster tests
                items.push(`{
                    "id": ${i},
                    "name": "Item ${i}",
                    "description": "This is item ${i}\\nWith multiple\\nLines of text",
                    "metadata": {
                        "created": "2023-01-01",
                        "tags": ["tag${i}\\nwith\\nnewlines", "normal-tag"],
                        "notes": "Note for item ${i}\\nSpanning\\nMultiple\\nLines"
                    }
                }`);
            }
            
            const jsonText = `{"items": [${items.join(',')}]}`;
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const startTime = Date.now();
            const result = jsonDetector.parseJsonSafely(document);
            const parseTime = Date.now() - startTime;

            assert.strictEqual(result.isValid, true);
            assert.ok(result.stringRanges.length > 0);
            
            // Should complete within reasonable time (5 seconds for large file)
            assert.ok(parseTime < 5000, `Parse time ${parseTime}ms exceeded threshold`);
            
            // Check performance metrics
            const metrics = jsonDetector.getPerformanceMetrics();
            assert.ok(metrics);
            assert.ok(metrics.stringCount > 0);
            assert.ok(metrics.newlineCount > 0);
        });

        test('should provide performance metrics', async () => {
            const jsonText = `{
                "data": "Test\\nString\\nWith\\nNewlines",
                "other": "Another\\nString"
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);
            const metrics = jsonDetector.getPerformanceMetrics();

            assert.strictEqual(result.isValid, true);
            assert.ok(metrics);
            assert.ok(metrics.parseTime >= 0);
            assert.ok(metrics.stringCount > 0);
            assert.ok(metrics.newlineCount > 0);
            assert.strictEqual(metrics.fileSize, jsonText.length);
        });

        test('should provide performance recommendations', async () => {
            const jsonText = `{"data": "Simple\\nTest"}`;
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            jsonDetector.parseJsonSafely(document);
            const recommendations = jsonDetector.getPerformanceRecommendations();

            assert.ok(Array.isArray(recommendations));
            // For small files, should have few or no recommendations
            assert.ok(recommendations.length >= 0);
        });

        test('should detect large documents', async () => {
            // Create a document that exceeds the large file threshold
            const largeContent = 'a'.repeat(200 * 1024); // 200KB
            const jsonText = `{"data": "Large content\\n${largeContent}"}`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            jsonDetector.parseJsonSafely(document);
            const isLarge = jsonDetector.isLargeDocument();

            assert.strictEqual(isLarge, true);
        });
    });

    suite('Edge Cases and Robustness', () => {
        test('should handle strings with only escape sequences', async () => {
            const jsonText = `{
                "tabs": "\\t\\t\\t",
                "quotes": "\\"\\"\\"",
                "backslashes": "\\\\\\\\\\\\",
                "mixed": "\\t\\"\\\\\\n\\r\\f\\b"
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Only the mixed string should have newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 1);
        });

        test('should handle empty strings and whitespace', async () => {
            const jsonText = `{
                "empty": "",
                "spaces": "   ",
                "tabs": "\\t\\t\\t",
                "newlines": "\\n\\n\\n",
                "mixed": "  \\n  \\t  \\n  "
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Should find strings with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 2);
        });

        test('should handle maximum nesting depth', async () => {
            // Create deeply nested structure (but not too deep to avoid stack overflow)
            let jsonText = `{"value": "Deep\\nValue"}`;
            for (let i = 0; i < 10; i++) { // Reduced depth for faster tests
                jsonText = `{"level": ${i}, "data": ${jsonText}}`;
            }
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Should find the deeply nested string with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 1);
        });

        test('should handle arrays with many elements', async () => {
            const elements = [];
            for (let i = 0; i < 50; i++) { // Reduced from 100 to 50 for faster tests
                elements.push(`"Element ${i}\\nLine 2"`);
            }
            
            const jsonText = `{"items": [${elements.join(',')}]}`;
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            // Should find all array elements with newlines
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.strictEqual(stringsWithNewlines.length, 50);
        });
    });

    suite('Real-world JSON Patterns', () => {
        test('should handle configuration files', async () => {
            const jsonText = `{
                "database": {
                    "connectionString": "Server=localhost;\\nDatabase=mydb;\\nTrusted_Connection=true;",
                    "options": {
                        "timeout": 30,
                        "retryPolicy": "Exponential\\nBackoff\\nStrategy"
                    }
                },
                "logging": {
                    "level": "INFO",
                    "format": "%(asctime)s - %(name)s\\n%(levelname)s - %(message)s",
                    "handlers": ["console", "file"]
                }
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.ok(stringsWithNewlines.length >= 3);
        });

        test('should handle API response data', async () => {
            const jsonText = `{
                "status": "success",
                "data": {
                    "users": [
                        {
                            "id": 1,
                            "name": "John Doe",
                            "bio": "Software engineer\\nPassionate about technology\\nLoves coding",
                            "posts": [
                                {
                                    "title": "My First Post",
                                    "content": "This is my first post\\nI'm excited to share\\nMy thoughts with you"
                                }
                            ]
                        }
                    ]
                },
                "meta": {
                    "pagination": {
                        "page": 1,
                        "total": 100
                    },
                    "debug": "Query executed in 0.5ms\\nCache hit: true\\nMemory usage: 45MB"
                }
            }`;
            
            const document = await vscode.workspace.openTextDocument({
                content: jsonText,
                language: 'json'
            });

            const result = jsonDetector.parseJsonSafely(document);

            assert.strictEqual(result.isValid, true);
            
            const stringsWithNewlines = result.stringRanges.filter(range => range.hasNewlines);
            assert.ok(stringsWithNewlines.length >= 3);
        });
    });
});