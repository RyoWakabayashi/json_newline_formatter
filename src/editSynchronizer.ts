import * as vscode from 'vscode';
import { JsonStringDetector, DetailedNewlinePosition, StringRange } from './jsonStringDetector';
import { DecorationManager } from './decorationManager';

/**
 * Interface for mapping between visual and actual positions
 */
export interface EditMapping {
    visualPosition: vscode.Position;
    actualPosition: vscode.Position;
    offset: number;
}

/**
 * Interface for document state tracking
 */
export interface DocumentState {
    originalContent: string;
    visualContent: string;
    mappings: EditMapping[];
    version: number;
}

/**
 * Interface for edit transformation results
 */
export interface EditTransformation {
    actualEdit: vscode.TextEdit;
    newMappings: EditMapping[];
    success: boolean;
    error?: string;
}

/**
 * Interface for cursor position transformation
 */
export interface CursorTransformation {
    visualPosition: vscode.Position;
    actualPosition: vscode.Position;
    isInDecoratedArea: boolean;
    stringRange?: StringRange;
}

/**
 * Manages synchronization between visual edits and actual file content
 * Handles bidirectional transformation between visual line breaks and \n escape sequences
 */
export class EditSynchronizer {
    private jsonDetector: JsonStringDetector;
    private decorationManager: DecorationManager;
    private documentStates: Map<string, DocumentState> = new Map();
    private isProcessingEdit: boolean = false;
    private disposables: vscode.Disposable[] = [];

    constructor(decorationManager: DecorationManager) {
        this.jsonDetector = new JsonStringDetector();
        this.decorationManager = decorationManager;
        this.setupEventHandlers();
    }

    /**
     * Set up event handlers for document changes
     */
    private setupEventHandlers(): void {
        // Listen for text document changes
        const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
            this.onDidChangeTextDocument(event);
        });

        // Listen for document saves
        const onWillSaveDocument = vscode.workspace.onWillSaveTextDocument((event) => {
            this.onWillSaveDocument(event.document);
        });

        // Listen for document opens/closes to manage state
        const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
            if (this.isJsonDocument(document)) {
                this.initializeDocumentState(document);
            }
        });

        const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument((document) => {
            this.cleanupDocumentState(document);
        });

        // Listen for selection changes to handle copy operations
        const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection((event) => {
            this.handleSelectionChange(event);
        });

        this.disposables.push(
            onDidChangeTextDocument,
            onWillSaveDocument,
            onDidOpenTextDocument,
            onDidCloseTextDocument,
            onDidChangeTextEditorSelection
        );
    }

    /**
     * Handle text document changes
     * @param event The text document change event
     */
    public onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        // Skip if we're already processing an edit to avoid recursion
        if (this.isProcessingEdit) {
            return;
        }

        const document = event.document;
        
        // Only process JSON documents
        if (!this.isJsonDocument(document)) {
            return;
        }

        try {
            // Check if JSON is valid before processing changes
            const parseResult = this.jsonDetector.parseJsonSafely(document);
            
            if (!parseResult.isValid) {
                // JSON is invalid, skip edit synchronization to avoid further corruption
                console.log('EditSynchronizer: Skipping edit synchronization for invalid JSON');
                return;
            }

            // Initialize document state if not exists
            this.ensureDocumentState(document);

            // Process each content change
            for (const change of event.contentChanges) {
                this.processContentChange(document, change);
            }

            // Update document state
            this.updateDocumentState(document);

            // Update decorations after processing changes
            this.decorationManager.updateDecorations(event);
            
        } catch (error) {
            console.error('EditSynchronizer: Error processing document changes', error);
            // Don't show user notification for every edit error to avoid spam
            // The JsonStringDetector will handle user notifications for parsing errors
        }
    }

    /**
     * Process a single content change
     * @param document The document being changed
     * @param change The specific content change
     */
    private processContentChange(document: vscode.TextDocument, change: vscode.TextDocumentContentChangeEvent): void {
        try {
            const changeRange = change.range;
            const newText = change.text;

            // Check if the change is within a decorated string area
            const affectedDecorations = this.decorationManager.getDecorationsInRange(changeRange);
            
            if (affectedDecorations.length > 0) {
                // This change affects decorated content, handle synchronization
                this.handleDecoratedAreaEdit(document, change);
            } else {
                // Check if the change introduces new newlines that need decoration
                if (newText.includes('\\n')) {
                    this.handleNewlineInsertion(document, change);
                }
            }
        } catch (error) {
            console.warn('EditSynchronizer: Error processing content change', error);
            // Continue processing other changes even if one fails
        }
    }

    /**
     * Handle edits within decorated string areas
     * @param document The document being edited
     * @param change The content change
     */
    private handleDecoratedAreaEdit(document: vscode.TextDocument, change: vscode.TextDocumentContentChangeEvent): void {
        const changeRange = change.range;
        const newText = change.text;

        // Find the string range containing this edit
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, changeRange.start);
        if (!stringRange) {
            return;
        }

        // Check if the new text contains actual line breaks (Enter key pressed)
        if (newText.includes('\n') && !newText.includes('\\n')) {
            // User pressed Enter, convert to \n escape sequence
            this.convertLineBreaksToEscapeSequences(document, change);
        } else if (change.text === '' && this.isDeleteAcrossLineBreak(document, changeRange)) {
            // User deleted across a visual line break, handle \n removal
            this.handleLineBreakDeletion(document, changeRange);
        }
    }

    /**
     * Handle insertion of new \n escape sequences
     * @param document The document being edited
     * @param change The content change
     */
    private handleNewlineInsertion(document: vscode.TextDocument, change: vscode.TextDocumentContentChangeEvent): void {
        // Check if the insertion is within a JSON string
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, change.range.start);
        if (stringRange) {
            // New \n sequences were added, decorations will be updated automatically
            // No additional synchronization needed for this case
        }
    }

    /**
     * Convert actual line breaks to \n escape sequences
     * @param document The document being edited
     * @param change The content change containing line breaks
     */
    private convertLineBreaksToEscapeSequences(document: vscode.TextDocument, change: vscode.TextDocumentContentChangeEvent): void {
        const newText = change.text;
        const convertedText = this.transformVisualContentToActual(document, newText, change.range);

        if (convertedText !== newText) {
            // Apply the conversion
            this.isProcessingEdit = true;
            
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, change.range, convertedText);
            
            vscode.workspace.applyEdit(edit).then(() => {
                this.isProcessingEdit = false;
                // Update cursor position after transformation
                this.updateCursorAfterTransformation(document, change.range, convertedText);
            });
        }
    }

    /**
     * Update cursor position after content transformation
     * @param document The document
     * @param range The range that was transformed
     * @param newContent The new content
     */
    private updateCursorAfterTransformation(document: vscode.TextDocument, range: vscode.Range, newContent: string): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return;
        }

        // Calculate the new cursor position based on the transformation
        const newEndPosition = new vscode.Position(
            range.start.line,
            range.start.character + newContent.length
        );

        // Transform to visual position if needed
        const visualPosition = this.transformActualToVisual(document, newEndPosition);
        
        // Update the cursor position
        editor.selection = new vscode.Selection(visualPosition, visualPosition);
    }

    /**
     * Check if a deletion spans across a visual line break
     * @param document The document being edited
     * @param range The range being deleted
     * @returns True if deletion spans a line break
     */
    private isDeleteAcrossLineBreak(document: vscode.TextDocument, range: vscode.Range): boolean {
        // Check if any decorations exist within or adjacent to the deletion range
        const decorations = this.decorationManager.getDecorationsInRange(range);
        
        // Also check for decorations just before or after the range
        const expandedRange = new vscode.Range(
            new vscode.Position(Math.max(0, range.start.line - 1), 0),
            new vscode.Position(range.end.line + 1, 0)
        );
        
        const nearbyDecorations = this.decorationManager.getDecorationsInRange(expandedRange);
        
        return decorations.length > 0 || nearbyDecorations.length > 0;
    }

    /**
     * Handle deletion that spans across visual line breaks
     * @param document The document being edited
     * @param range The range being deleted
     */
    private handleLineBreakDeletion(document: vscode.TextDocument, range: vscode.Range): void {
        // Find all \n sequences that might be affected by this deletion
        const text = document.getText(range);
        const newlinePositions = this.jsonDetector.getDetailedNewlinePositions(document);
        
        // Filter to positions within the deletion range
        const affectedNewlines = newlinePositions.filter(pos => 
            range.contains(pos.position) || range.contains(pos.endPosition)
        );

        if (affectedNewlines.length > 0) {
            // The deletion affects \n sequences, they will be removed naturally
            // No additional synchronization needed as the text is already being deleted
        }
    }

    /**
     * Transform visual position to actual file position with enhanced accuracy
     * @param document The document
     * @param visualPosition The visual position
     * @returns The corresponding actual position
     */
    public transformVisualToActual(document: vscode.TextDocument, visualPosition: vscode.Position): vscode.Position {
        this.ensureDocumentState(document);
        
        const newlinePositions = this.jsonDetector.getDetailedNewlinePositions(document);
        if (newlinePositions.length === 0) {
            return visualPosition;
        }

        // Calculate the actual position by accounting for \n sequences
        let actualLine = visualPosition.line;
        let actualCharacter = visualPosition.character;
        let cumulativeOffset = 0;

        // Find all newlines that affect this position
        for (const newlinePos of newlinePositions) {
            const newlineVisualPos = this.calculateVisualPositionForNewline(document, newlinePos);
            
            // If this newline comes before our target position, it affects the transformation
            if (newlineVisualPos.line < visualPosition.line || 
                (newlineVisualPos.line === visualPosition.line && newlineVisualPos.character <= visualPosition.character)) {
                
                // Each \n sequence adds 2 characters to the actual position but creates a visual line break
                if (newlineVisualPos.line < visualPosition.line) {
                    // This newline is on a previous line, so it affects our line calculation
                    actualLine = newlinePos.position.line;
                    cumulativeOffset += 2; // \n is 2 characters
                } else {
                    // This newline is on the same line, adjust character position
                    cumulativeOffset += 2;
                }
            }
        }

        // Apply the cumulative offset to get the actual position
        const actualOffset = document.offsetAt(new vscode.Position(actualLine, actualCharacter)) + cumulativeOffset;
        return document.positionAt(Math.max(0, actualOffset));
    }

    /**
     * Transform actual file position to visual position with enhanced accuracy
     * @param document The document
     * @param actualPosition The actual position
     * @returns The corresponding visual position
     */
    public transformActualToVisual(document: vscode.TextDocument, actualPosition: vscode.Position): vscode.Position {
        this.ensureDocumentState(document);
        
        const newlinePositions = this.jsonDetector.getDetailedNewlinePositions(document);
        if (newlinePositions.length === 0) {
            return actualPosition;
        }

        // Calculate the visual position by accounting for \n sequences that become line breaks
        let visualLine = actualPosition.line;
        let visualCharacter = actualPosition.character;
        let newlinesBefore = 0;

        const actualOffset = document.offsetAt(actualPosition);

        // Count how many \n sequences come before this position
        for (const newlinePos of newlinePositions) {
            if (newlinePos.offset < actualOffset) {
                newlinesBefore++;
                
                // Each \n sequence creates a visual line break
                if (newlinePos.offset + 2 <= actualOffset) {
                    // The position is after this newline, so it affects line calculation
                    visualLine++;
                    // Reset character position for new line
                    visualCharacter = actualOffset - (newlinePos.offset + 2);
                }
            }
        }

        return new vscode.Position(visualLine, Math.max(0, visualCharacter));
    }

    /**
     * Transform content from visual representation to actual file content
     * @param document The document
     * @param visualContent The visual content with line breaks
     * @param range The range being transformed
     * @returns The actual content with \n escape sequences
     */
    public transformVisualContentToActual(document: vscode.TextDocument, visualContent: string, range: vscode.Range): string {
        // Check if this content is within a JSON string
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, range.start);
        if (!stringRange) {
            return visualContent; // Not in a string, no transformation needed
        }

        // Convert actual line breaks to \n escape sequences
        return visualContent.replace(/\n/g, '\\n');
    }

    /**
     * Transform content from actual file content to visual representation
     * @param document The document
     * @param actualContent The actual content with \n escape sequences
     * @param range The range being transformed
     * @returns The visual content with line breaks
     */
    public transformActualContentToVisual(document: vscode.TextDocument, actualContent: string, range: vscode.Range): string {
        // Check if this content is within a JSON string
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, range.start);
        if (!stringRange) {
            return actualContent; // Not in a string, no transformation needed
        }

        // Convert \n escape sequences to actual line breaks for visual display
        return actualContent.replace(/\\n/g, '\n');
    }

    /**
     * Handle cursor positioning across transformed content
     * @param document The document
     * @param position The cursor position
     * @returns Cursor transformation information
     */
    public transformCursorPosition(document: vscode.TextDocument, position: vscode.Position): CursorTransformation {
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, position);
        const isInDecoratedArea = stringRange !== null && stringRange.hasNewlines;

        if (isInDecoratedArea) {
            // Position is in a decorated string area
            const visualPosition = this.transformActualToVisual(document, position);
            const actualPosition = position;

            return {
                visualPosition,
                actualPosition,
                isInDecoratedArea: true,
                stringRange: stringRange || undefined
            };
        } else {
            // Position is not in a decorated area
            return {
                visualPosition: position,
                actualPosition: position,
                isInDecoratedArea: false
            };
        }
    }

    /**
     * Calculate the visual position for a newline decoration
     * @param document The document
     * @param newlinePos The detailed newline position
     * @returns The visual position where the line break appears
     */
    private calculateVisualPositionForNewline(document: vscode.TextDocument, newlinePos: DetailedNewlinePosition): vscode.Position {
        // The visual position is where the line break appears, which is after the \n sequence
        const visualInfo = this.jsonDetector.calculateVisualPosition(document, newlinePos);
        
        return new vscode.Position(
            newlinePos.position.line + visualInfo.visualLine,
            visualInfo.visualCharacter
        );
    }

    /**
     * Handle document save preparation
     * @param document The document being saved
     */
    public onWillSaveDocument(document: vscode.TextDocument): void {
        if (!this.isJsonDocument(document)) {
            return;
        }

        // Ensure all visual line breaks are properly converted to \n sequences
        // This is handled automatically by our change handlers, but we can add
        // a final validation here if needed
        this.validateDocumentConsistency(document);
    }

    /**
     * Validate that the document content is consistent between visual and actual representations
     * @param document The document to validate
     */
    private validateDocumentConsistency(document: vscode.TextDocument): void {
        try {
            // Use the safe JSON parsing method
            const parseResult = this.jsonDetector.parseJsonSafely(document);
            
            if (!parseResult.isValid) {
                console.warn('EditSynchronizer: Document contains invalid JSON after edits', parseResult.error);
                
                // Show warning to user about JSON validity
                vscode.window.showWarningMessage(
                    'JSON Newline Formatter: The document contains invalid JSON. Some features may not work correctly.',
                    'Show Details'
                ).then(selection => {
                    if (selection === 'Show Details' && parseResult.errorPosition) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor && editor.document === document) {
                            editor.selection = new vscode.Selection(parseResult.errorPosition, parseResult.errorPosition);
                            editor.revealRange(new vscode.Range(parseResult.errorPosition, parseResult.errorPosition));
                        }
                    }
                });
            }
        } catch (error) {
            console.error('EditSynchronizer: Error validating document consistency', error);
        }
    }

    /**
     * Initialize document state for tracking
     * @param document The document to initialize
     */
    private initializeDocumentState(document: vscode.TextDocument): void {
        const content = document.getText();
        const mappings = this.calculateInitialMappings(document);

        const state: DocumentState = {
            originalContent: content,
            visualContent: content, // Will be updated as decorations are applied
            mappings,
            version: document.version
        };

        this.documentStates.set(document.uri.toString(), state);
    }

    /**
     * Update document state after changes
     * @param document The document that was changed
     */
    private updateDocumentState(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        const existingState = this.documentStates.get(uri);

        if (existingState) {
            existingState.originalContent = document.getText();
            existingState.version = document.version;
            existingState.mappings = this.calculateInitialMappings(document);
        } else {
            this.initializeDocumentState(document);
        }
    }

    /**
     * Calculate initial position mappings for a document
     * @param document The document to analyze
     * @returns Array of edit mappings
     */
    private calculateInitialMappings(document: vscode.TextDocument): EditMapping[] {
        const mappings: EditMapping[] = [];
        const newlinePositions = this.jsonDetector.getDetailedNewlinePositions(document);

        let cumulativeOffset = 0;

        for (const newlinePos of newlinePositions) {
            // Each \n sequence (2 characters) becomes a visual line break (0 characters in terms of text)
            // So the offset increases by 2 for each newline
            mappings.push({
                visualPosition: new vscode.Position(
                    newlinePos.position.line + cumulativeOffset,
                    newlinePos.position.character
                ),
                actualPosition: newlinePos.position,
                offset: cumulativeOffset
            });

            cumulativeOffset += 2; // \n is 2 characters
        }

        return mappings;
    }

    /**
     * Calculate distance between two positions
     * @param pos1 First position
     * @param pos2 Second position
     * @returns Distance metric
     */
    private calculatePositionDistance(pos1: vscode.Position, pos2: vscode.Position): number {
        const lineDiff = Math.abs(pos1.line - pos2.line);
        const charDiff = Math.abs(pos1.character - pos2.character);
        return lineDiff * 1000 + charDiff; // Weight lines more heavily
    }

    /**
     * Calculate character offset between two positions
     * @param pos1 First position
     * @param pos2 Second position
     * @returns Character offset
     */
    private calculatePositionOffset(pos1: vscode.Position, pos2: vscode.Position): number {
        // This is a simplified calculation - in a real implementation,
        // you'd need to account for the actual document content
        const lineDiff = pos1.line - pos2.line;
        const charDiff = pos1.character - pos2.character;
        return lineDiff * 100 + charDiff; // Simplified offset calculation
    }

    /**
     * Clean up document state when document is closed
     * @param document The document being closed
     */
    private cleanupDocumentState(document: vscode.TextDocument): void {
        this.documentStates.delete(document.uri.toString());
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
     * Get the current document state
     * @param document The document
     * @returns The document state or null if not tracked
     */
    public getDocumentState(document: vscode.TextDocument): DocumentState | null {
        this.ensureDocumentState(document);
        return this.documentStates.get(document.uri.toString()) || null;
    }

    /**
     * Ensure document state exists for a JSON document
     * @param document The document to ensure state for
     */
    private ensureDocumentState(document: vscode.TextDocument): void {
        if (this.isJsonDocument(document) && !this.documentStates.has(document.uri.toString())) {
            this.initializeDocumentState(document);
        }
    }

    /**
     * Check if edit synchronization is currently active
     * @returns True if synchronization is enabled
     */
    public isSynchronizationActive(): boolean {
        return !this.isProcessingEdit;
    }

    /**
     * Handle selection changes for copy operations
     * @param event The selection change event
     */
    private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor;
        
        if (!this.isJsonDocument(editor.document)) {
            return;
        }

        // Store the current selection for potential copy operations
        this.storeSelectionContext(editor, event.selections);
    }

    /**
     * Store selection context for clipboard operations
     * @param editor The text editor
     * @param selections The current selections
     */
    private storeSelectionContext(editor: vscode.TextEditor, selections: readonly vscode.Selection[]): void {
        // We'll use this to track selections that might be copied
        // This helps us prepare for clipboard transformations
        for (const selection of selections) {
            if (!selection.isEmpty) {
                const selectedText = editor.document.getText(selection);
                const isInDecoratedArea = this.isSelectionInDecoratedArea(editor.document, selection);
                
                if (isInDecoratedArea) {
                    // Prepare for potential clipboard transformation
                    this.prepareClipboardTransformation(editor.document, selection, selectedText);
                }
            }
        }
    }

    /**
     * Check if a selection is in a decorated area
     * @param document The document
     * @param selection The selection
     * @returns True if selection is in decorated area
     */
    private isSelectionInDecoratedArea(document: vscode.TextDocument, selection: vscode.Selection): boolean {
        const decorationsInRange = this.decorationManager.getDecorationsInRange(selection);
        return decorationsInRange.length > 0;
    }

    /**
     * Prepare clipboard transformation for decorated content
     * @param document The document
     * @param selection The selection
     * @param selectedText The selected text
     */
    private prepareClipboardTransformation(
        document: vscode.TextDocument, 
        selection: vscode.Selection, 
        selectedText: string
    ): void {
        // This method prepares the context for clipboard operations
        // The actual transformation happens during paste operations
        
        // Store information about the selection for later use
        const uri = document.uri.toString();
        const state = this.documentStates.get(uri);
        
        if (state) {
            // Add selection context to document state
            (state as any).lastSelection = {
                range: selection,
                text: selectedText,
                isDecorated: true,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Handle copy operation for decorated content
     * @param document The document
     * @param selection The selection being copied
     * @returns The transformed text for clipboard
     */
    public handleCopyOperation(document: vscode.TextDocument, selection: vscode.Selection): string {
        const selectedText = document.getText(selection);
        
        // Check if the selection contains decorated content
        const isInDecoratedArea = this.isSelectionInDecoratedArea(document, selection);
        
        if (isInDecoratedArea) {
            // Transform the content for clipboard
            // When copying decorated content, we want to copy the visual representation
            return this.transformActualContentToVisual(document, selectedText, selection);
        }
        
        return selectedText;
    }

    /**
     * Handle paste operation for decorated content
     * @param document The document
     * @param position The position where content is being pasted
     * @param clipboardText The text from clipboard
     * @returns The transformed text for pasting
     */
    public handlePasteOperation(
        document: vscode.TextDocument, 
        position: vscode.Position, 
        clipboardText: string
    ): string {
        // Check if we're pasting into a decorated area
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, position);
        const isInDecoratedArea = stringRange !== null && stringRange.hasNewlines;
        
        if (isInDecoratedArea) {
            // Transform clipboard content for decorated areas
            // Convert visual line breaks to escape sequences
            return this.transformVisualContentToActual(document, clipboardText, new vscode.Range(position, position));
        }
        
        return clipboardText;
    }

    /**
     * Register clipboard commands for enhanced copy/paste behavior
     * @param context The extension context
     */
    public registerClipboardCommands(context: vscode.ExtensionContext): void {
        // Register enhanced copy command
        const copyCommand = vscode.commands.registerCommand('json-newline-formatter.copy', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !this.isJsonDocument(editor.document)) {
                // Fall back to default copy
                await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
                return;
            }

            const selection = editor.selection;
            if (selection.isEmpty) {
                // Fall back to default copy
                await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
                return;
            }

            // Handle copy with transformation
            const transformedText = this.handleCopyOperation(editor.document, selection);
            await vscode.env.clipboard.writeText(transformedText);
        });

        // Register enhanced paste command
        const pasteCommand = vscode.commands.registerCommand('json-newline-formatter.paste', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !this.isJsonDocument(editor.document)) {
                // Fall back to default paste
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                return;
            }

            const clipboardText = await vscode.env.clipboard.readText();
            const position = editor.selection.active;
            
            // Handle paste with transformation
            const transformedText = this.handlePasteOperation(editor.document, position, clipboardText);
            
            // Apply the paste operation
            const edit = new vscode.WorkspaceEdit();
            if (editor.selection.isEmpty) {
                edit.insert(editor.document.uri, position, transformedText);
            } else {
                edit.replace(editor.document.uri, editor.selection, transformedText);
            }
            
            await vscode.workspace.applyEdit(edit);
        });

        context.subscriptions.push(copyCommand, pasteCommand);
    }

    /**
     * Test clipboard operations with decorated content
     * @param document The document to test
     * @param selection The selection to test
     * @returns Test results
     */
    public testClipboardOperations(document: vscode.TextDocument, selection: vscode.Selection): {
        originalText: string;
        copiedText: string;
        pastedText: string;
        isTransformed: boolean;
    } {
        const originalText = document.getText(selection);
        const copiedText = this.handleCopyOperation(document, selection);
        const pastedText = this.handlePasteOperation(document, selection.start, copiedText);
        
        return {
            originalText,
            copiedText,
            pastedText,
            isTransformed: copiedText !== originalText || pastedText !== copiedText
        };
    }

    /**
     * Validate clipboard content for JSON compatibility
     * @param text The clipboard text
     * @param targetPosition The position where it will be pasted
     * @param document The target document
     * @returns Validation results
     */
    public validateClipboardContent(
        text: string, 
        targetPosition: vscode.Position, 
        document: vscode.TextDocument
    ): {
        isValid: boolean;
        needsTransformation: boolean;
        transformedText: string;
        errors: string[];
    } {
        const errors: string[] = [];
        let needsTransformation = false;
        let transformedText = text;
        
        // Check if we're pasting into a JSON string
        const stringRange = this.jsonDetector.getStringRangeAtPosition(document, targetPosition);
        
        if (stringRange) {
            // We're pasting into a JSON string
            if (text.includes('\n') && !text.includes('\\n')) {
                // Text contains actual line breaks, needs transformation
                needsTransformation = true;
                transformedText = text.replace(/\n/g, '\\n');
            }
            
            // Validate that the transformed text won't break JSON
            try {
                // Create a test JSON with the pasted content
                const testJson = `{"test": "${transformedText}"}`;
                JSON.parse(testJson);
            } catch (error) {
                errors.push('Pasted content would create invalid JSON');
            }
        }
        
        return {
            isValid: errors.length === 0,
            needsTransformation,
            transformedText,
            errors
        };
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
        this.documentStates.clear();
    }
}