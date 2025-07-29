import * as vscode from 'vscode';
import { JsonStringDetector, DetailedNewlinePosition } from './jsonStringDetector';

/**
 * Interface for decoration data
 */
export interface NewlineDecoration {
    range: vscode.Range;
    renderText: string;
    isActive: boolean;
}

/**
 * Interface for decoration state management
 */
export interface DecorationState {
    decorations: NewlineDecoration[];
    decorationType: vscode.TextEditorDecorationType;
    isEnabled: boolean;
}

/**
 * Manages VSCode decorations for rendering \n escape sequences as visual line breaks
 */
export class DecorationManager {
    private decorationType: vscode.TextEditorDecorationType;
    private lineBreakDecorationType: vscode.TextEditorDecorationType;
    private currentDecorations: NewlineDecoration[] = [];
    private jsonDetector: JsonStringDetector;
    private isEnabled: boolean = true;

    constructor() {
        this.jsonDetector = new JsonStringDetector();
        this.decorationType = this.createDecorationType();
        this.lineBreakDecorationType = this.createLineBreakDecorationType();
    }

    /**
     * Create the decoration type for hiding \n escape sequences
     */
    private createDecorationType(): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            // Hide the \n escape sequence by making it transparent
            color: 'transparent',
            backgroundColor: 'transparent',
            // Ensure the decoration doesn't interfere with selection or cursor positioning
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            // Collapse the visual space of the \n sequence
            letterSpacing: '-0.5em',
            // Ensure it doesn't affect syntax highlighting
            textDecoration: 'none',
            // Make it non-selectable to avoid interference
            cursor: 'default'
        });
    }

    /**
     * Create the decoration type for rendering visual line breaks
     */
    private createLineBreakDecorationType(): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            // This decoration will be used to insert line breaks after \n sequences
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            // Ensure it doesn't interfere with existing styling
            isWholeLine: false
        });
    }

    /**
     * Apply decorations to a document based on detected \n positions
     * @param document The VSCode text document to decorate
     */
    public applyDecorations(document: vscode.TextDocument): void {
        if (!this.isEnabled) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return;
        }

        // Clear existing decorations
        this.clearDecorations();

        // Find all newline positions in the document
        const newlinePositions = this.jsonDetector.getDetailedNewlinePositions(document);
        
        // Create decorations for each newline position
        const hideDecorationOptions: vscode.DecorationOptions[] = [];
        const lineBreakDecorationOptions: vscode.DecorationOptions[] = [];
        this.currentDecorations = [];

        for (const newlinePos of newlinePositions) {
            const decoration = this.createDecorationForNewline(document, newlinePos);
            if (decoration) {
                this.currentDecorations.push(decoration);
                
                // Create decoration to hide the \n sequence
                const hideOption: vscode.DecorationOptions = {
                    range: decoration.range,
                    hoverMessage: 'Formatted \\n escape sequence (hidden)'
                };
                hideDecorationOptions.push(hideOption);
                
                // Create decoration to add visual line break after the \n sequence
                const lineBreakRange = new vscode.Range(
                    newlinePos.endPosition,
                    newlinePos.endPosition
                );
                
                const lineBreakOption: vscode.DecorationOptions = {
                    range: lineBreakRange,
                    renderOptions: {
                        after: {
                            contentText: '\n',
                            // Style the line break to be invisible but functional
                            color: 'transparent',
                            backgroundColor: 'transparent',
                            // Ensure proper line break rendering
                            fontStyle: 'normal',
                            fontWeight: 'normal',
                            textDecoration: 'none'
                        }
                    },
                    hoverMessage: 'Visual line break for \\n sequence'
                };
                lineBreakDecorationOptions.push(lineBreakOption);
            }
        }

        // Apply both decoration types
        editor.setDecorations(this.decorationType, hideDecorationOptions);
        editor.setDecorations(this.lineBreakDecorationType, lineBreakDecorationOptions);
    }

    /**
     * Create a decoration for a specific newline position
     * @param document The VSCode text document
     * @param newlinePos The detailed newline position
     * @returns The created decoration or null if invalid
     */
    private createDecorationForNewline(document: vscode.TextDocument, newlinePos: DetailedNewlinePosition): NewlineDecoration | null {
        try {
            // Create range that covers the \n escape sequence
            const range = new vscode.Range(newlinePos.position, newlinePos.endPosition);
            
            return {
                range,
                renderText: '\n',
                isActive: true
            };
        } catch (error) {
            console.warn('DecorationManager: Failed to create decoration for newline position', error);
            return null;
        }
    }

    /**
     * Clear all current decorations
     */
    public clearDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.setDecorations(this.decorationType, []);
            editor.setDecorations(this.lineBreakDecorationType, []);
        }
        
        // Mark all decorations as inactive
        this.currentDecorations.forEach(decoration => {
            decoration.isActive = false;
        });
        
        this.currentDecorations = [];
    }

    /**
     * Update decorations when document changes
     * @param changes The text document change event
     */
    public updateDecorations(changes: vscode.TextDocumentChangeEvent): void {
        if (!this.isEnabled) {
            return;
        }

        // For now, we'll do a full refresh on any change
        // This can be optimized later to only update affected decorations
        this.applyDecorations(changes.document);
    }

    /**
     * Enable or disable decoration rendering
     * @param enabled Whether decorations should be enabled
     */
    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        
        if (!enabled) {
            this.clearDecorations();
        } else {
            // Re-apply decorations if we have an active editor
            const editor = vscode.window.activeTextEditor;
            if (editor && this.isJsonDocument(editor.document)) {
                this.applyDecorations(editor.document);
            }
        }
    }

    /**
     * Check if decorations are currently enabled
     * @returns True if decorations are enabled
     */
    public isDecorationEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Get the current decoration state
     * @returns The current decoration state
     */
    public getDecorationState(): DecorationState {
        return {
            decorations: [...this.currentDecorations],
            decorationType: this.decorationType,
            isEnabled: this.isEnabled
        };
    }

    /**
     * Get the number of active decorations
     * @returns The count of active decorations
     */
    public getActiveDecorationCount(): number {
        return this.currentDecorations.filter(d => d.isActive).length;
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
     * Dispose of resources when the decoration manager is no longer needed
     */
    public dispose(): void {
        this.clearDecorations();
        this.decorationType.dispose();
        this.lineBreakDecorationType.dispose();
    }

    /**
     * Check if a position is within a decorated range
     * @param position The position to check
     * @returns The decoration at the position, or null if none
     */
    public getDecorationAtPosition(position: vscode.Position): NewlineDecoration | null {
        for (const decoration of this.currentDecorations) {
            if (decoration.isActive && decoration.range.contains(position)) {
                return decoration;
            }
        }
        return null;
    }

    /**
     * Get all decorations within a given range
     * @param range The range to search within
     * @returns Array of decorations within the range
     */
    public getDecorationsInRange(range: vscode.Range): NewlineDecoration[] {
        return this.currentDecorations.filter(decoration => 
            decoration.isActive && range.intersection(decoration.range) !== undefined
        );
    }

    /**
     * Force a refresh of decorations for the active editor
     */
    public refresh(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor && this.isJsonDocument(editor.document)) {
            this.applyDecorations(editor.document);
        }
    }
}