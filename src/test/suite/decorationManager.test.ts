import * as assert from 'assert';
import * as vscode from 'vscode';
import { DecorationManager } from '../../decorationManager';

suite('DecorationManager Test Suite', () => {
    let decorationManager: DecorationManager;
    
    setup(() => {
        decorationManager = new DecorationManager();
    });
    
    teardown(() => {
        decorationManager.dispose();
    });

    test('should create decoration manager with default enabled state', () => {
        assert.strictEqual(decorationManager.isDecorationEnabled(), true);
    });

    test('should disable and enable decorations', () => {
        decorationManager.setEnabled(false);
        assert.strictEqual(decorationManager.isDecorationEnabled(), false);
        
        decorationManager.setEnabled(true);
        assert.strictEqual(decorationManager.isDecorationEnabled(), true);
    });

    test('should return correct decoration state', () => {
        const state = decorationManager.getDecorationState();
        assert.strictEqual(state.isEnabled, true);
        assert.strictEqual(Array.isArray(state.decorations), true);
        assert.notStrictEqual(state.decorationType, undefined);
    });

    test('should start with zero active decorations', () => {
        assert.strictEqual(decorationManager.getActiveDecorationCount(), 0);
    });

    test('should clear decorations when disabled', () => {
        decorationManager.setEnabled(false);
        assert.strictEqual(decorationManager.getActiveDecorationCount(), 0);
    });

    test('should handle refresh without active editor', () => {
        // This should not throw an error
        assert.doesNotThrow(() => {
            decorationManager.refresh();
        });
    });

    test('should handle getDecorationAtPosition with no decorations', () => {
        const position = new vscode.Position(0, 0);
        const decoration = decorationManager.getDecorationAtPosition(position);
        assert.strictEqual(decoration, null);
    });

    test('should handle getDecorationsInRange with no decorations', () => {
        const range = new vscode.Range(0, 0, 1, 0);
        const decorations = decorationManager.getDecorationsInRange(range);
        assert.strictEqual(decorations.length, 0);
    });

    test('should dispose without errors', () => {
        assert.doesNotThrow(() => {
            decorationManager.dispose();
        });
    });

    test('should handle decoration styling configuration', () => {
        const state = decorationManager.getDecorationState();
        
        // Verify decoration type exists and has proper configuration
        assert.notStrictEqual(state.decorationType, undefined);
        
        // The decoration type should be properly configured for hiding \n sequences
        // We can't directly test the styling properties, but we can ensure the type exists
        assert.strictEqual(typeof state.decorationType, 'object');
    });
});

// Integration tests that require a document
suite('DecorationManager Integration Tests', () => {
    let decorationManager: DecorationManager;
    let document: vscode.TextDocument;
    
    suiteSetup(async () => {
        // Create a test JSON document
        const content = '{\n  "message": "Hello\\nWorld\\nTest",\n  "data": "Single line"\n}';
        document = await vscode.workspace.openTextDocument({
            content,
            language: 'json'
        });
    });
    
    setup(() => {
        decorationManager = new DecorationManager();
    });
    
    teardown(() => {
        decorationManager.dispose();
    });

    test('should apply decorations to JSON document with newlines', async () => {
        // Open the document in an editor
        const editor = await vscode.window.showTextDocument(document);
        
        // Apply decorations
        decorationManager.applyDecorations(document);
        
        // Check that decorations were created
        const decorationCount = decorationManager.getActiveDecorationCount();
        assert.strictEqual(decorationCount, 2, 'Should create 2 decorations for 2 \\n sequences');
        
        // Close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('should handle document changes', async () => {
        const editor = await vscode.window.showTextDocument(document);
        
        // Apply initial decorations
        decorationManager.applyDecorations(document);
        const initialCount = decorationManager.getActiveDecorationCount();
        
        // Simulate a document change event
        const changeEvent = {
            document,
            contentChanges: [],
            reason: undefined
        } as vscode.TextDocumentChangeEvent;
        
        decorationManager.updateDecorations(changeEvent);
        
        // Should still have the same number of decorations
        assert.strictEqual(decorationManager.getActiveDecorationCount(), initialCount);
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('should not apply decorations when disabled', async () => {
        const editor = await vscode.window.showTextDocument(document);
        
        // Disable decorations
        decorationManager.setEnabled(false);
        
        // Try to apply decorations
        decorationManager.applyDecorations(document);
        
        // Should have no decorations
        assert.strictEqual(decorationManager.getActiveDecorationCount(), 0);
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('should clear decorations when document is not active', () => {
        // Create a different document
        const otherContent = '{"test": "value"}';
        
        vscode.workspace.openTextDocument({
            content: otherContent,
            language: 'json'
        }).then(otherDoc => {
            // Try to apply decorations to a document that's not in the active editor
            decorationManager.applyDecorations(otherDoc);
            
            // Should have no decorations since document is not active
            assert.strictEqual(decorationManager.getActiveDecorationCount(), 0);
        });
    });

    test('should handle complex JSON with multiple decoration types', async () => {
        // Create a more complex JSON document
        const complexContent = `{
  "multiline": "Line 1\\nLine 2\\nLine 3",
  "nested": {
    "data": "Hello\\nWorld",
    "array": ["Item 1\\nContinued", "Item 2"]
  },
  "simple": "No newlines here"
}`;
        
        const complexDoc = await vscode.workspace.openTextDocument({
            content: complexContent,
            language: 'json'
        });
        
        const editor = await vscode.window.showTextDocument(complexDoc);
        
        // Apply decorations
        decorationManager.applyDecorations(complexDoc);
        
        // Should create decorations for all \n sequences
        const decorationCount = decorationManager.getActiveDecorationCount();
        assert.strictEqual(decorationCount, 4, 'Should create 4 decorations for 4 \\n sequences');
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('should preserve syntax highlighting with decorations', async () => {
        // Create a fresh document for this test
        const testContent = '{\n  "message": "Hello\\nWorld\\nTest",\n  "data": "Single line"\n}';
        const testDocument = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'json'
        });
        
        // Create a fresh decoration manager for this test
        const testDecorationManager = new DecorationManager();
        
        const editor = await vscode.window.showTextDocument(testDocument);
        
        // Apply decorations
        testDecorationManager.applyDecorations(testDocument);
        
        // Verify decorations don't interfere with document language
        assert.strictEqual(testDocument.languageId, 'json');
        
        // Verify decorations are applied
        const decorationCount = testDecorationManager.getActiveDecorationCount();
        assert.strictEqual(decorationCount, 2);
        
        testDecorationManager.dispose();
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('should handle decoration placement accuracy', async () => {
        // Create a fresh document for this test
        const testContent = '{\n  "message": "Hello\\nWorld\\nTest",\n  "data": "Single line"\n}';
        const testDocument = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'json'
        });
        
        // Create a fresh decoration manager for this test
        const testDecorationManager = new DecorationManager();
        
        const editor = await vscode.window.showTextDocument(testDocument);
        
        // Apply decorations
        testDecorationManager.applyDecorations(testDocument);
        
        // Get decorations and verify their positions
        const state = testDecorationManager.getDecorationState();
        const decorations = state.decorations;
        
        assert.strictEqual(decorations.length, 2);
        
        // Verify each decoration has a valid range
        decorations.forEach(decoration => {
            assert.strictEqual(decoration.isActive, true);
            assert.notStrictEqual(decoration.range, undefined);
            assert.strictEqual(decoration.range.isEmpty, false);
        });
        
        testDecorationManager.dispose();
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});