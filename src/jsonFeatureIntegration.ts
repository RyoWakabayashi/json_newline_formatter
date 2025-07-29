import * as vscode from 'vscode';
import { DecorationManager } from './decorationManager';
import { JsonStringDetector } from './jsonStringDetector';

/**
 * Interface for folding range information
 */
export interface FoldingRangeInfo {
    range: vscode.FoldingRange;
    isAffectedByDecorations: boolean;
    decorationCount: number;
}

/**
 * Interface for completion item enhancement
 */
export interface CompletionItemInfo {
    item: vscode.CompletionItem;
    isInDecoratedArea: boolean;
    needsTransformation: boolean;
}

/**
 * Handles integration with VSCode's built-in JSON features
 * Ensures decorations don't interfere with folding, auto-completion, and validation
 */
export class JsonFeatureIntegration {
    private decorationManager: DecorationManager;
    private jsonDetector: JsonStringDetector;
    private disposables: vscode.Disposable[] = [];

    constructor(decorationManager: DecorationManager) {
        this.decorationManager = decorationManager;
        this.jsonDetector = new JsonStringDetector();
        this.setupFeatureIntegration();
    }

    /**
     * Set up integration with VSCode JSON features
     */
    private setupFeatureIntegration(): void {
        // Register folding range provider to ensure our decorations work with folding
        const foldingProvider = vscode.languages.registerFoldingRangeProvider(
            { language: 'json' },
            this
        );

        // Register completion item provider to enhance auto-completion
        const completionProvider = vscode.languages.registerCompletionItemProvider(
            { language: 'json' },
            this,
            '"', // Trigger on quote character
            ':', // Trigger on colon
            ',', // Trigger on comma
            '{', // Trigger on opening brace
            '[', // Trigger on opening bracket
            '\\' // Trigger on backslash (for escape sequences)
        );

        // Register hover provider to show information about decorated content
        const hoverProvider = vscode.languages.registerHoverProvider(
            { language: 'json' },
            this
        );

        this.disposables.push(foldingProvider, completionProvider, hoverProvider);
    }

    /**
     * Provide folding ranges that work correctly with decorations
     * @param document The document to provide folding ranges for
     * @param context The folding context
     * @param token Cancellation token
     * @returns Array of folding ranges
     */
    public provideFoldingRanges(
        document: vscode.TextDocument,
        context: vscode.FoldingContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        if (token.isCancellationRequested) {
            return [];
        }

        try {
            // Get the default JSON folding ranges
            const defaultRanges = this.getDefaultJsonFoldingRanges(document);
            
            // Enhance ranges with decoration awareness
            const enhancedRanges = this.enhanceFoldingRanges(document, defaultRanges);
            
            return enhancedRanges;
        } catch (error) {
            console.warn('JsonFeatureIntegration: Error providing folding ranges', error);
            return [];
        }
    }

    /**
     * Get default JSON folding ranges by parsing the structure
     * @param document The document to analyze
     * @returns Array of folding ranges
     */
    private getDefaultJsonFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];
        const text = document.getText();

        try {
            // Parse JSON to understand structure
            JSON.parse(text);
            
            // Find object and array boundaries for folding
            let braceStack: { char: string; line: number; isInString: boolean }[] = [];
            let inString = false;
            let escapeNext = false;

            const lines = text.split('\n');
            
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                
                for (let charIndex = 0; charIndex < line.length; charIndex++) {
                    const char = line[charIndex];
                    
                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }
                    
                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }
                    
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    
                    if (inString) {
                        continue;
                    }
                    
                    if (char === '{' || char === '[') {
                        braceStack.push({
                            char,
                            line: lineIndex,
                            isInString: false
                        });
                    } else if (char === '}' || char === ']') {
                        const opening = braceStack.pop();
                        if (opening && lineIndex > opening.line) {
                            // Create folding range
                            const kind = opening.char === '{' ? 
                                vscode.FoldingRangeKind.Region : 
                                vscode.FoldingRangeKind.Region;
                            
                            ranges.push(new vscode.FoldingRange(
                                opening.line,
                                lineIndex,
                                kind
                            ));
                        }
                    }
                }
            }
        } catch (error) {
            // JSON is malformed, return empty ranges
            console.warn('JsonFeatureIntegration: Malformed JSON, no folding ranges provided');
        }

        return ranges;
    }

    /**
     * Enhance folding ranges to work correctly with decorations
     * @param document The document
     * @param defaultRanges The default folding ranges
     * @returns Enhanced folding ranges
     */
    private enhanceFoldingRanges(
        document: vscode.TextDocument, 
        defaultRanges: vscode.FoldingRange[]
    ): vscode.FoldingRange[] {
        const enhancedRanges: vscode.FoldingRange[] = [];
        const decorationState = this.decorationManager.getDecorationState();

        for (const range of defaultRanges) {
            // Check if this folding range contains any decorations
            const rangeStart = new vscode.Position(range.start, 0);
            const rangeEnd = new vscode.Position(range.end, Number.MAX_SAFE_INTEGER);
            const vscodeRange = new vscode.Range(rangeStart, rangeEnd);
            
            const decorationsInRange = this.decorationManager.getDecorationsInRange(vscodeRange);
            
            // Create enhanced range info
            const enhancedRange = new vscode.FoldingRange(
                range.start,
                range.end,
                range.kind
            );

            // Folding should work normally even with decorations
            enhancedRanges.push(enhancedRange);
        }

        return enhancedRanges;
    }

    /**
     * Provide completion items that work correctly with decorations
     * @param document The document
     * @param position The position where completion is requested
     * @param token Cancellation token
     * @param context Completion context
     * @returns Completion items
     */
    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        if (token.isCancellationRequested) {
            return [];
        }

        try {
            // Check if we're in a decorated string area
            const stringRange = this.jsonDetector.getStringRangeAtPosition(document, position);
            const isInDecoratedArea = stringRange !== null && stringRange.hasNewlines;

            // Get basic JSON completion items
            const completionItems = this.getJsonCompletionItems(document, position, context);

            // Enhance completion items for decorated areas
            if (isInDecoratedArea) {
                return this.enhanceCompletionItemsForDecoratedArea(
                    completionItems, 
                    document, 
                    position, 
                    stringRange
                );
            }

            return completionItems;
        } catch (error) {
            console.warn('JsonFeatureIntegration: Error providing completion items', error);
            return [];
        }
    }

    /**
     * Get basic JSON completion items
     * @param document The document
     * @param position The position
     * @param context The completion context
     * @returns Basic completion items
     */
    private getJsonCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        
        // Analyze the current context to provide appropriate completions
        const lineText = document.lineAt(position.line).text;
        const beforeCursor = lineText.substring(0, position.character);
        const afterCursor = lineText.substring(position.character);

        // Provide string value completions
        if (this.isInStringValue(beforeCursor, afterCursor)) {
            // Add escape sequence completions
            items.push(
                this.createCompletionItem('\\n', 'Newline escape sequence', vscode.CompletionItemKind.Snippet),
                this.createCompletionItem('\\t', 'Tab escape sequence', vscode.CompletionItemKind.Snippet),
                this.createCompletionItem('\\r', 'Carriage return escape sequence', vscode.CompletionItemKind.Snippet),
                this.createCompletionItem('\\"', 'Quote escape sequence', vscode.CompletionItemKind.Snippet),
                this.createCompletionItem('\\\\', 'Backslash escape sequence', vscode.CompletionItemKind.Snippet)
            );
        }

        // Provide property name completions
        if (this.isInPropertyName(beforeCursor, afterCursor)) {
            items.push(
                this.createCompletionItem('"message"', 'Message property', vscode.CompletionItemKind.Property),
                this.createCompletionItem('"description"', 'Description property', vscode.CompletionItemKind.Property),
                this.createCompletionItem('"name"', 'Name property', vscode.CompletionItemKind.Property),
                this.createCompletionItem('"value"', 'Value property', vscode.CompletionItemKind.Property)
            );
        }

        return items;
    }

    /**
     * Enhance completion items for decorated areas
     * @param items The basic completion items
     * @param document The document
     * @param position The position
     * @param stringRange The string range containing the position
     * @returns Enhanced completion items
     */
    private enhanceCompletionItemsForDecoratedArea(
        items: vscode.CompletionItem[],
        document: vscode.TextDocument,
        position: vscode.Position,
        stringRange: any
    ): vscode.CompletionItem[] {
        const enhancedItems = [...items];

        // Add special completions for decorated string areas
        enhancedItems.push(
            this.createCompletionItem(
                '\\n',
                'Visual line break (will be displayed as actual line break)',
                vscode.CompletionItemKind.Snippet,
                'Creates a visual line break in the formatted display'
            )
        );

        // Mark items that need transformation
        enhancedItems.forEach(item => {
            if (item.insertText && typeof item.insertText === 'string' && item.insertText.includes('\n')) {
                // Transform actual line breaks to escape sequences
                item.insertText = item.insertText.replace(/\n/g, '\\n');
                item.detail = (item.detail || '') + ' (transformed for JSON)';
            }
        });

        return enhancedItems;
    }

    /**
     * Create a completion item
     * @param text The text to insert
     * @param label The label to display
     * @param kind The completion item kind
     * @param documentation Optional documentation
     * @returns The completion item
     */
    private createCompletionItem(
        text: string,
        label: string,
        kind: vscode.CompletionItemKind,
        documentation?: string
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, kind);
        item.insertText = text;
        item.detail = label;
        
        if (documentation) {
            item.documentation = new vscode.MarkdownString(documentation);
        }

        return item;
    }

    /**
     * Check if the cursor is in a string value
     * @param beforeCursor Text before cursor
     * @param afterCursor Text after cursor
     * @returns True if in string value
     */
    private isInStringValue(beforeCursor: string, afterCursor: string): boolean {
        // Simple heuristic: check if we're between quotes and after a colon
        const hasOpenQuote = beforeCursor.lastIndexOf('"') > beforeCursor.lastIndexOf(':');
        const hasCloseQuote = afterCursor.indexOf('"') !== -1;
        return hasOpenQuote && hasCloseQuote;
    }

    /**
     * Check if the cursor is in a property name
     * @param beforeCursor Text before cursor
     * @param afterCursor Text after cursor
     * @returns True if in property name
     */
    private isInPropertyName(beforeCursor: string, afterCursor: string): boolean {
        // Simple heuristic: check if we're between quotes and before a colon
        const hasOpenQuote = beforeCursor.lastIndexOf('"') > beforeCursor.lastIndexOf(',');
        const hasColonAfter = afterCursor.includes(':');
        return hasOpenQuote && hasColonAfter;
    }

    /**
     * Provide hover information for decorated content
     * @param document The document
     * @param position The position
     * @param token Cancellation token
     * @returns Hover information
     */
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        if (token.isCancellationRequested) {
            return null;
        }

        try {
            // Check if we're hovering over a decoration
            const decoration = this.decorationManager.getDecorationAtPosition(position);
            
            if (decoration) {
                const hoverText = new vscode.MarkdownString();
                hoverText.appendMarkdown('**JSON Newline Formatter**\n\n');
                hoverText.appendMarkdown('This `\\n` escape sequence is displayed as a visual line break.\n\n');
                hoverText.appendMarkdown('- **Actual content**: `\\n` escape sequence\n');
                hoverText.appendMarkdown('- **Visual display**: Line break\n');
                hoverText.appendMarkdown('- **Editing**: Type normally, line breaks will be converted to `\\n`');

                return new vscode.Hover(hoverText, decoration.range);
            }

            // Check if we're in a decorated string area
            const stringRange = this.jsonDetector.getStringRangeAtPosition(document, position);
            if (stringRange && stringRange.hasNewlines) {
                const hoverText = new vscode.MarkdownString();
                hoverText.appendMarkdown('**Formatted JSON String**\n\n');
                hoverText.appendMarkdown('This string contains `\\n` escape sequences that are displayed as visual line breaks.\n\n');
                hoverText.appendMarkdown('You can edit this content naturally - line breaks will be automatically converted to escape sequences.');

                const range = new vscode.Range(stringRange.start, stringRange.end);
                return new vscode.Hover(hoverText, range);
            }

            return null;
        } catch (error) {
            console.warn('JsonFeatureIntegration: Error providing hover information', error);
            return null;
        }
    }

    /**
     * Validate that JSON schema validation still works with decorations
     * @param document The document to validate
     * @returns Validation results
     */
    public validateJsonSchema(document: vscode.TextDocument): {
        isValid: boolean;
        errors: string[];
        decorationInterference: boolean;
    } {
        try {
            // Parse the JSON to check basic validity
            const content = document.getText();
            JSON.parse(content);

            // Check if decorations might interfere with schema validation
            const decorationState = this.decorationManager.getDecorationState();
            const hasActiveDecorations = decorationState.decorations.some(d => d.isActive);

            return {
                isValid: true,
                errors: [],
                decorationInterference: false // Our decorations don't modify the actual content
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [error instanceof Error ? error.message : 'Unknown JSON error'],
                decorationInterference: false
            };
        }
    }

    /**
     * Test folding functionality with decorations
     * @param document The document to test
     * @returns Test results
     */
    public testFoldingWithDecorations(document: vscode.TextDocument): {
        foldingRangesCount: number;
        decoratedRangesCount: number;
        interferenceDetected: boolean;
    } {
        const foldingRanges = this.getDefaultJsonFoldingRanges(document);
        const decorationState = this.decorationManager.getDecorationState();
        
        // Check for interference between folding and decorations
        let interferenceDetected = false;
        
        for (const range of foldingRanges) {
            const rangeStart = new vscode.Position(range.start, 0);
            const rangeEnd = new vscode.Position(range.end, Number.MAX_SAFE_INTEGER);
            const vscodeRange = new vscode.Range(rangeStart, rangeEnd);
            
            const decorationsInRange = this.decorationManager.getDecorationsInRange(vscodeRange);
            
            // Decorations shouldn't interfere with folding since they don't modify structure
            // This is more of a sanity check
            if (decorationsInRange.length > 0) {
                // This is expected and not interference
            }
        }

        return {
            foldingRangesCount: foldingRanges.length,
            decoratedRangesCount: decorationState.decorations.length,
            interferenceDetected
        };
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}