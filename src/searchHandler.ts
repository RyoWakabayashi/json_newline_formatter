import * as vscode from 'vscode';
import { DecorationManager } from './decorationManager';
import { EditSynchronizer } from './editSynchronizer';
import { JsonStringDetector } from './jsonStringDetector';

/**
 * Interface for search result information
 */
export interface SearchResult {
    range: vscode.Range;
    text: string;
    isInDecoratedArea: boolean;
    visualRange?: vscode.Range;
    actualRange: vscode.Range;
}

/**
 * Interface for replace operation information
 */
export interface ReplaceOperation {
    searchResult: SearchResult;
    replacementText: string;
    transformedReplacementText: string;
    success: boolean;
    error?: string;
}

/**
 * Handles Find/Replace operations in decorated JSON content
 * Ensures search and replace work correctly with both visual and actual content
 */
export class SearchHandler {
    private decorationManager: DecorationManager;
    private editSynchronizer: EditSynchronizer;
    private jsonDetector: JsonStringDetector;
    private disposables: vscode.Disposable[] = [];

    constructor(decorationManager: DecorationManager, editSynchronizer: EditSynchronizer) {
        this.decorationManager = decorationManager;
        this.editSynchronizer = editSynchronizer;
        this.jsonDetector = new JsonStringDetector();
        this.setupEventHandlers();
    }

    /**
     * Set up event handlers for search operations
     */
    private setupEventHandlers(): void {
        // Listen for find widget state changes
        // Note: VSCode doesn't provide direct API for find widget events,
        // but we can monitor document changes that might be from find/replace
        
        // Monitor selection changes that might be from find operations
        const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection((event) => {
            this.handleSelectionChange(event);
        });

        this.disposables.push(onDidChangeTextEditorSelection);
    }

    /**
     * Handle selection changes that might be from find operations
     * @param event The selection change event
     */
    private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor;
        
        // Only handle JSON documents
        if (!this.isJsonDocument(editor.document)) {
            return;
        }

        // Check if any selections are in decorated areas
        for (const selection of event.selections) {
            if (!selection.isEmpty) {
                this.handleSearchSelection(editor, selection);
            }
        }
    }

    /**
     * Handle a search selection in the editor
     * @param editor The text editor
     * @param selection The selection range
     */
    private handleSearchSelection(editor: vscode.TextEditor, selection: vscode.Selection): void {
        const decorationsInRange = this.decorationManager.getDecorationsInRange(selection);
        
        if (decorationsInRange.length > 0) {
            // Selection includes decorated content, we may need to adjust highlighting
            this.adjustSearchHighlighting(editor, selection, decorationsInRange);
        }
    }

    /**
     * Adjust search highlighting for decorated content
     * @param editor The text editor
     * @param selection The selection range
     * @param decorations The decorations in the selection range
     */
    private adjustSearchHighlighting(
        editor: vscode.TextEditor, 
        selection: vscode.Selection, 
        decorations: any[]
    ): void {
        // For now, we'll let VSCode handle the highlighting naturally
        // In the future, we could add custom highlighting logic here
        // to better integrate with our decorations
    }

    /**
     * Transform search text to work with both visual and actual content
     * @param searchText The original search text
     * @param document The document being searched
     * @returns Object with both visual and actual search patterns
     */
    public transformSearchText(searchText: string, document: vscode.TextDocument): {
        visualPattern: string;
        actualPattern: string;
        needsTransformation: boolean;
    } {
        // Check if the search text contains newlines or \n sequences
        const hasActualNewlines = searchText.includes('\n');
        const hasEscapedNewlines = searchText.includes('\\n');

        if (hasActualNewlines) {
            // User is searching for visual line breaks, convert to \n for actual content
            return {
                visualPattern: searchText,
                actualPattern: searchText.replace(/\n/g, '\\n'),
                needsTransformation: true
            };
        } else if (hasEscapedNewlines) {
            // User is searching for \n sequences, convert to actual line breaks for visual
            return {
                visualPattern: searchText.replace(/\\n/g, '\n'),
                actualPattern: searchText,
                needsTransformation: true
            };
        } else {
            // No transformation needed
            return {
                visualPattern: searchText,
                actualPattern: searchText,
                needsTransformation: false
            };
        }
    }

    /**
     * Find all occurrences of a pattern in the document
     * @param document The document to search
     * @param searchText The text to search for
     * @param options Search options
     * @returns Array of search results
     */
    public findInDocument(
        document: vscode.TextDocument, 
        searchText: string, 
        options: {
            matchCase?: boolean;
            matchWholeWord?: boolean;
            useRegex?: boolean;
        } = {}
    ): SearchResult[] {
        const results: SearchResult[] = [];
        const transformedSearch = this.transformSearchText(searchText, document);
        
        // Search in actual content
        const actualResults = this.performSearch(
            document, 
            transformedSearch.actualPattern, 
            options
        );

        // Transform results to include visual information
        for (const result of actualResults) {
            const searchResult = this.createSearchResult(document, result, transformedSearch.needsTransformation);
            results.push(searchResult);
        }

        return results;
    }

    /**
     * Perform the actual search operation
     * @param document The document to search
     * @param pattern The search pattern
     * @param options Search options
     * @returns Array of ranges where matches were found
     */
    private performSearch(
        document: vscode.TextDocument, 
        pattern: string, 
        options: {
            matchCase?: boolean;
            matchWholeWord?: boolean;
            useRegex?: boolean;
        }
    ): vscode.Range[] {
        const results: vscode.Range[] = [];
        const text = document.getText();
        
        let searchPattern: RegExp;
        
        try {
            if (options.useRegex) {
                const flags = options.matchCase ? 'g' : 'gi';
                searchPattern = new RegExp(pattern, flags);
            } else {
                // Escape special regex characters for literal search
                const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flags = options.matchCase ? 'g' : 'gi';
                
                if (options.matchWholeWord) {
                    searchPattern = new RegExp(`\\b${escapedPattern}\\b`, flags);
                } else {
                    searchPattern = new RegExp(escapedPattern, flags);
                }
            }
        } catch (error) {
            // Invalid regex pattern
            console.warn('SearchHandler: Invalid search pattern', error);
            return results;
        }

        let match;
        while ((match = searchPattern.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            results.push(new vscode.Range(startPos, endPos));
            
            // Prevent infinite loop for zero-length matches
            if (match[0].length === 0) {
                searchPattern.lastIndex++;
            }
        }

        return results;
    }

    /**
     * Create a search result with visual and actual information
     * @param document The document
     * @param range The found range
     * @param needsTransformation Whether transformation is needed
     * @returns The search result object
     */
    private createSearchResult(
        document: vscode.TextDocument, 
        range: vscode.Range, 
        needsTransformation: boolean
    ): SearchResult {
        const text = document.getText(range);
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, range.start);
        const isInDecoratedArea = stringRange !== null && stringRange.hasNewlines;

        let visualRange: vscode.Range | undefined;
        
        if (isInDecoratedArea && needsTransformation) {
            // Transform the range to visual coordinates
            const visualStart = this.editSynchronizer.transformActualToVisual(document, range.start);
            const visualEnd = this.editSynchronizer.transformActualToVisual(document, range.end);
            visualRange = new vscode.Range(visualStart, visualEnd);
        }

        return {
            range,
            text,
            isInDecoratedArea,
            visualRange,
            actualRange: range
        };
    }

    /**
     * Replace text in the document with proper transformation
     * @param document The document to modify
     * @param searchResults The search results to replace
     * @param replacementText The replacement text
     * @returns Array of replace operations performed
     */
    public replaceInDocument(
        document: vscode.TextDocument, 
        searchResults: SearchResult[], 
        replacementText: string
    ): Promise<ReplaceOperation[]> {
        return new Promise(async (resolve) => {
            const operations: ReplaceOperation[] = [];
            const edit = new vscode.WorkspaceEdit();

            for (const searchResult of searchResults) {
                const operation = this.createReplaceOperation(document, searchResult, replacementText);
                operations.push(operation);

                if (operation.success) {
                    edit.replace(
                        document.uri, 
                        operation.searchResult.actualRange, 
                        operation.transformedReplacementText
                    );
                }
            }

            try {
                const success = await vscode.workspace.applyEdit(edit);
                if (!success) {
                    operations.forEach(op => {
                        op.success = false;
                        op.error = 'Failed to apply workspace edit';
                    });
                }
            } catch (error) {
                operations.forEach(op => {
                    op.success = false;
                    op.error = error instanceof Error ? error.message : 'Unknown error';
                });
            }

            resolve(operations);
        });
    }

    /**
     * Create a replace operation with proper text transformation
     * @param document The document
     * @param searchResult The search result to replace
     * @param replacementText The replacement text
     * @returns The replace operation
     */
    private createReplaceOperation(
        document: vscode.TextDocument, 
        searchResult: SearchResult, 
        replacementText: string
    ): ReplaceOperation {
        let transformedReplacementText = replacementText;

        if (searchResult.isInDecoratedArea) {
            // Transform replacement text for decorated areas
            transformedReplacementText = this.editSynchronizer.transformVisualContentToActual(
                document, 
                replacementText, 
                searchResult.actualRange
            );
        }

        return {
            searchResult,
            replacementText,
            transformedReplacementText,
            success: true
        };
    }

    /**
     * Handle find widget operations
     * This method can be called when we detect find widget usage
     * @param document The document being searched
     * @param searchText The search text
     */
    public handleFindOperation(document: vscode.TextDocument, searchText: string): void {
        if (!this.isJsonDocument(document)) {
            return;
        }

        // Find all matches and ensure they're properly highlighted
        const results = this.findInDocument(document, searchText);
        
        // Log for debugging
        console.log(`SearchHandler: Found ${results.length} matches for "${searchText}"`);
        
        // Update decorations to ensure they don't interfere with search highlighting
        this.decorationManager.refresh();
    }

    /**
     * Handle replace operations
     * @param document The document being modified
     * @param searchText The search text
     * @param replacementText The replacement text
     * @param replaceAll Whether to replace all occurrences
     */
    public async handleReplaceOperation(
        document: vscode.TextDocument, 
        searchText: string, 
        replacementText: string, 
        replaceAll: boolean = false
    ): Promise<void> {
        if (!this.isJsonDocument(document)) {
            return;
        }

        const results = this.findInDocument(document, searchText);
        
        if (results.length === 0) {
            return;
        }

        const resultsToReplace = replaceAll ? results : [results[0]];
        const operations = await this.replaceInDocument(document, resultsToReplace, replacementText);
        
        // Log results
        const successCount = operations.filter(op => op.success).length;
        console.log(`SearchHandler: Successfully replaced ${successCount}/${operations.length} occurrences`);
        
        // Refresh decorations after replace operations
        this.decorationManager.refresh();
    }

    /**
     * Check if a document is a JSON document
     * @param document The document to check
     * @returns True if the document is JSON
     */
    private isJsonDocument(document: vscode.TextDocument): boolean {
        return document.languageId === 'json' || document.languageId === 'jsonc';
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}