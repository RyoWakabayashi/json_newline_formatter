import * as assert from 'assert';
import * as vscode from 'vscode';
import { JsonStringDetector, StringRange, NewlinePosition, DetailedNewlinePosition, VisualPositionInfo, PerformanceMetrics } from '../../jsonStringDetector';
import { DecorationManager, NewlineDecoration, DecorationState } from '../../decorationManager';
import { EditSynchronizer, EditMapping, DocumentState, CursorTransformation } from '../../editSynchronizer';

suite('Core Interface Tests', () => {
    let jsonDetector: JsonStringDetector;
    let decorationManager: DecorationManager;
    let editSynchronizer: EditSynchronizer;

    setup(() => {
        jsonDetector = new JsonStringDetector();
        decorationManager = new DecorationManager();
        editSynchronizer = new EditSynchronizer(decorationManager);
    });

    teardown(() => {
        decorationManager.dispose();
        editSynchronizer.dispose();
    });

    suite('StringRange Interface Tests', () => {
        test('should create valid StringRange objects', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const ranges = jsonDetector.findStringRanges(document);
            assert.ok(ranges.length > 0, 'Should find string ranges');

            const stringRange = ranges.find(r => r.hasNewlines);
            assert.ok(stringRange, 'Should find string with newlines');
            
            // Test StringRange interface properties
            assert.ok(stringRange!.start instanceof vscode.Position, 'start should be Position');
            assert.ok(stringRange!.end instanceof vscode.Position, 'end should be Position');
            assert.strictEqual(typeof stringRange!.content, 'string', 'content should be string');
            assert.strictEqual(typeof stringRange!.hasNewlines, 'boolean', 'hasNewlines should be boolean');
            assert.strictEqual(stringRange!.hasNewlines, true, 'hasNewlines should be true for strings with \\n');
        });

        test('should handle StringRange position comparisons', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const ranges = jsonDetector.findStringRanges(document);
            const stringRange = ranges.find(r => r.hasNewlines);
            assert.ok(stringRange, 'Should find string with newlines');

            // Test position relationships
            assert.ok(stringRange!.start.isBefore(stringRange!.end), 'start should be before end');
            assert.ok(stringRange!.start.line <= stringRange!.end.line, 'start line should be <= end line');
        });
    });

    suite('NewlinePosition Interface Tests', () => {
        test('should create valid NewlinePosition objects', async () => {
            const content = '{"test": "Hello\\nWorld\\nTest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const positions = jsonDetector.extractNewlinePositions(document);
            assert.ok(positions.length > 0, 'Should find newline positions');

            const newlinePos = positions[0];
            
            // Test NewlinePosition interface properties
            assert.ok(newlinePos.position instanceof vscode.Position, 'position should be Position');
            assert.ok(newlinePos.stringRange, 'stringRange should exist');
            assert.strictEqual(typeof newlinePos.stringRange.content, 'string', 'stringRange.content should be string');
            assert.strictEqual(newlinePos.stringRange.hasNewlines, true, 'stringRange should have newlines');
        });

        test('should maintain position consistency in NewlinePosition', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const positions = jsonDetector.extractNewlinePositions(document);
            assert.strictEqual(positions.length, 1, 'Should find exactly one newline');

            const newlinePos = positions[0];
            
            // Position should be within the string range
            assert.ok(
                newlinePos.position.isAfterOrEqual(newlinePos.stringRange.start) &&
                newlinePos.position.isBefore(newlinePos.stringRange.end),
                'newline position should be within string range'
            );
        });
    });

    suite('DetailedNewlinePosition Interface Tests', () => {
        test('should create valid DetailedNewlinePosition objects', async () => {
            const content = '{"test": "Hello\\nWorld\\nTest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const detailedPositions = jsonDetector.getDetailedNewlinePositions(document);
            assert.ok(detailedPositions.length > 0, 'Should find detailed newline positions');

            const detailedPos = detailedPositions[0];
            
            // Test DetailedNewlinePosition interface properties (extends NewlinePosition)
            assert.ok(detailedPos.position instanceof vscode.Position, 'position should be Position');
            assert.ok(detailedPos.endPosition instanceof vscode.Position, 'endPosition should be Position');
            assert.ok(detailedPos.stringRange, 'stringRange should exist');
            assert.strictEqual(typeof detailedPos.offset, 'number', 'offset should be number');
            assert.strictEqual(typeof detailedPos.endOffset, 'number', 'endOffset should be number');
            assert.strictEqual(typeof detailedPos.indexInString, 'number', 'indexInString should be number');
            assert.strictEqual(typeof detailedPos.beforeText, 'string', 'beforeText should be string');
            assert.strictEqual(typeof detailedPos.afterText, 'string', 'afterText should be string');
        });

        test('should maintain position ordering in DetailedNewlinePosition', async () => {
            const content = '{"test": "Hello\\nWorld\\nTest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const detailedPositions = jsonDetector.getDetailedNewlinePositions(document);
            assert.strictEqual(detailedPositions.length, 2, 'Should find exactly two newlines');

            const firstPos = detailedPositions[0];
            const secondPos = detailedPositions[1];
            
            // Test position ordering
            assert.ok(firstPos.position.isBefore(secondPos.position), 'first position should be before second');
            assert.ok(firstPos.offset < secondPos.offset, 'first offset should be less than second');
            assert.strictEqual(firstPos.indexInString, 0, 'first newline should have index 0');
            assert.strictEqual(secondPos.indexInString, 1, 'second newline should have index 1');
        });
    });

    suite('VisualPositionInfo Interface Tests', () => {
        test('should create valid VisualPositionInfo objects', async () => {
            const content = '{"test": "Hello\\nWorld\\nTest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const detailedPositions = jsonDetector.getDetailedNewlinePositions(document);
            assert.ok(detailedPositions.length > 0, 'Should find detailed positions');

            const visualInfo = jsonDetector.calculateVisualPosition(document, detailedPositions[0]);
            
            // Test VisualPositionInfo interface properties
            assert.strictEqual(typeof visualInfo.visualLine, 'number', 'visualLine should be number');
            assert.strictEqual(typeof visualInfo.visualCharacter, 'number', 'visualCharacter should be number');
            assert.strictEqual(typeof visualInfo.totalVisualLines, 'number', 'totalVisualLines should be number');
            assert.strictEqual(typeof visualInfo.currentLineContent, 'string', 'currentLineContent should be string');
            assert.strictEqual(typeof visualInfo.isLastNewlineInString, 'boolean', 'isLastNewlineInString should be boolean');
            
            // Test logical constraints
            assert.ok(visualInfo.visualLine >= 0, 'visualLine should be non-negative');
            assert.ok(visualInfo.visualCharacter >= 0, 'visualCharacter should be non-negative');
            assert.ok(visualInfo.totalVisualLines > 0, 'totalVisualLines should be positive');
        });
    });

    suite('PerformanceMetrics Interface Tests', () => {
        test('should create valid PerformanceMetrics objects', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            // Trigger parsing to generate metrics
            jsonDetector.findStringRanges(document);
            
            const metrics = jsonDetector.getPerformanceMetrics();
            assert.ok(metrics, 'Should have performance metrics');
            
            // Test PerformanceMetrics interface properties
            assert.strictEqual(typeof metrics!.parseTime, 'number', 'parseTime should be number');
            assert.strictEqual(typeof metrics!.stringCount, 'number', 'stringCount should be number');
            assert.strictEqual(typeof metrics!.newlineCount, 'number', 'newlineCount should be number');
            assert.strictEqual(typeof metrics!.fileSize, 'number', 'fileSize should be number');
            assert.strictEqual(typeof metrics!.isLargeFile, 'boolean', 'isLargeFile should be boolean');
            
            // Test logical constraints
            assert.ok(metrics!.parseTime >= 0, 'parseTime should be non-negative');
            assert.ok(metrics!.stringCount >= 0, 'stringCount should be non-negative');
            assert.ok(metrics!.newlineCount >= 0, 'newlineCount should be non-negative');
            assert.ok(metrics!.fileSize >= 0, 'fileSize should be non-negative');
        });

        test('should provide accurate performance metrics', async () => {
            const content = '{"test": "Hello\\nWorld", "other": "No newlines"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            jsonDetector.findStringRanges(document);
            
            const metrics = jsonDetector.getPerformanceMetrics();
            assert.ok(metrics, 'Should have metrics');
            
            // Verify accuracy
            assert.strictEqual(metrics!.fileSize, content.length, 'fileSize should match content length');
            assert.ok(metrics!.stringCount > 0, 'should count strings');
            assert.ok(metrics!.newlineCount > 0, 'should count newlines');
        });
    });

    suite('NewlineDecoration Interface Tests', () => {
        test('should create valid NewlineDecoration objects', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const editor = await vscode.window.showTextDocument(document);
            decorationManager.applyDecorations(document);
            
            const state = decorationManager.getDecorationState();
            
            if (state.decorations.length > 0) {
                const decoration = state.decorations[0];
                
                // Test NewlineDecoration interface properties
                assert.ok(decoration.range instanceof vscode.Range, 'range should be Range');
                assert.strictEqual(typeof decoration.renderText, 'string', 'renderText should be string');
                assert.strictEqual(typeof decoration.isActive, 'boolean', 'isActive should be boolean');
            }
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('DecorationState Interface Tests', () => {
        test('should create valid DecorationState objects', () => {
            const state = decorationManager.getDecorationState();
            
            // Test DecorationState interface properties
            assert.ok(Array.isArray(state.decorations), 'decorations should be array');
            assert.ok(state.decorationType, 'decorationType should exist');
            assert.strictEqual(typeof state.isEnabled, 'boolean', 'isEnabled should be boolean');
        });

        test('should maintain consistent DecorationState', () => {
            decorationManager.setEnabled(false);
            let state = decorationManager.getDecorationState();
            assert.strictEqual(state.isEnabled, false, 'should reflect disabled state');
            
            decorationManager.setEnabled(true);
            state = decorationManager.getDecorationState();
            assert.strictEqual(state.isEnabled, true, 'should reflect enabled state');
        });
    });

    suite('EditMapping Interface Tests', () => {
        test('should handle EditMapping objects correctly', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            // Initialize document state to create mappings
            decorationManager.applyDecorations(document);
            const documentState = editSynchronizer.getDocumentState(document);
            
            if (documentState && documentState.mappings.length > 0) {
                const mapping = documentState.mappings[0];
                
                // Test EditMapping interface properties
                assert.ok(mapping.visualPosition instanceof vscode.Position, 'visualPosition should be Position');
                assert.ok(mapping.actualPosition instanceof vscode.Position, 'actualPosition should be Position');
                assert.strictEqual(typeof mapping.offset, 'number', 'offset should be number');
            }
        });
    });

    suite('DocumentState Interface Tests', () => {
        test('should create valid DocumentState objects', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            decorationManager.applyDecorations(document);
            const documentState = editSynchronizer.getDocumentState(document);
            
            assert.ok(documentState, 'Should have document state');
            
            // Test DocumentState interface properties
            assert.strictEqual(typeof documentState!.originalContent, 'string', 'originalContent should be string');
            assert.strictEqual(typeof documentState!.visualContent, 'string', 'visualContent should be string');
            assert.ok(Array.isArray(documentState!.mappings), 'mappings should be array');
            assert.strictEqual(typeof documentState!.version, 'number', 'version should be number');
        });
    });

    suite('CursorTransformation Interface Tests', () => {
        test('should create valid CursorTransformation objects', async () => {
            const content = '{"test": "Hello\\nWorld"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            decorationManager.applyDecorations(document);
            
            const position = new vscode.Position(0, 15);
            const cursorTransform = editSynchronizer.transformCursorPosition(document, position);
            
            // Test CursorTransformation interface properties
            assert.ok(cursorTransform.visualPosition instanceof vscode.Position, 'visualPosition should be Position');
            assert.ok(cursorTransform.actualPosition instanceof vscode.Position, 'actualPosition should be Position');
            assert.strictEqual(typeof cursorTransform.isInDecoratedArea, 'boolean', 'isInDecoratedArea should be boolean');
            
            if (cursorTransform.stringRange) {
                assert.ok(cursorTransform.stringRange.start instanceof vscode.Position, 'stringRange.start should be Position');
                assert.ok(cursorTransform.stringRange.end instanceof vscode.Position, 'stringRange.end should be Position');
            }
        });
    });

    suite('Interface Integration Tests', () => {
        test('should maintain consistency across interfaces', async () => {
            const content = '{"test": "Hello\\nWorld\\nTest"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            // Test integration between JsonStringDetector interfaces
            const stringRanges = jsonDetector.findStringRanges(document);
            const newlinePositions = jsonDetector.extractNewlinePositions(document);
            const detailedPositions = jsonDetector.getDetailedNewlinePositions(document);
            
            // Verify consistency
            const stringRangesWithNewlines = stringRanges.filter(r => r.hasNewlines);
            assert.strictEqual(stringRangesWithNewlines.length, 1, 'Should have one string with newlines');
            assert.strictEqual(newlinePositions.length, 2, 'Should have two newline positions');
            assert.strictEqual(detailedPositions.length, 2, 'Should have two detailed positions');
            
            // Verify all newline positions reference the same string range
            for (const pos of newlinePositions) {
                assert.strictEqual(pos.stringRange.content, stringRangesWithNewlines[0].content, 'All positions should reference same string');
            }
            
            for (const pos of detailedPositions) {
                assert.strictEqual(pos.stringRange.content, stringRangesWithNewlines[0].content, 'All detailed positions should reference same string');
            }
        });

        test('should handle interface null/undefined cases gracefully', async () => {
            const content = '{"simple": "no newlines"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            // Test cases where interfaces might return null/undefined
            const newlinePositions = jsonDetector.extractNewlinePositions(document);
            assert.strictEqual(newlinePositions.length, 0, 'Should have no newline positions');
            
            const detailedPositions = jsonDetector.getDetailedNewlinePositions(document);
            assert.strictEqual(detailedPositions.length, 0, 'Should have no detailed positions');
            
            const position = new vscode.Position(0, 5);
            const stringRange = jsonDetector.getStringRangeAtPosition(document, position);
            assert.ok(stringRange, 'Should find string range at position');
            assert.strictEqual(stringRange!.hasNewlines, false, 'String should not have newlines');
        });
    });

    suite('Edge Case Interface Tests', () => {
        test('should handle empty document interfaces', async () => {
            const content = '{}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const stringRanges = jsonDetector.findStringRanges(document);
            const newlinePositions = jsonDetector.extractNewlinePositions(document);
            const detailedPositions = jsonDetector.getDetailedNewlinePositions(document);
            
            assert.strictEqual(stringRanges.length, 0, 'Empty object should have no strings');
            assert.strictEqual(newlinePositions.length, 0, 'Empty object should have no newlines');
            assert.strictEqual(detailedPositions.length, 0, 'Empty object should have no detailed positions');
        });

        test('should handle malformed JSON interfaces gracefully', async () => {
            const content = '{"invalid": }';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const stringRanges = jsonDetector.findStringRanges(document);
            const newlinePositions = jsonDetector.extractNewlinePositions(document);
            
            // Malformed JSON should return empty arrays
            assert.strictEqual(stringRanges.length, 0, 'Malformed JSON should return no strings');
            assert.strictEqual(newlinePositions.length, 0, 'Malformed JSON should return no newlines');
        });

        test('should handle interface boundary conditions', async () => {
            const content = '{"boundary": "\\n"}';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'json'
            });

            const stringRanges = jsonDetector.findStringRanges(document);
            const newlinePositions = jsonDetector.extractNewlinePositions(document);
            
            assert.strictEqual(stringRanges.length, 2, 'Should find key and value strings');
            assert.strictEqual(newlinePositions.length, 1, 'Should find single newline');
            
            const stringWithNewline = stringRanges.find(r => r.hasNewlines);
            assert.ok(stringWithNewline, 'Should find string with newline');
            assert.strictEqual(stringWithNewline!.content, '\\n', 'Content should be just the newline sequence');
        });
    });
});