import * as vscode from 'vscode';

/**
 * Represents a string range within a JSON document
 */
export interface StringRange {
    start: vscode.Position;
    end: vscode.Position;
    content: string;
    hasNewlines: boolean;
}

/**
 * Represents a position of a newline escape sequence within a string
 */
export interface NewlinePosition {
    position: vscode.Position;
    stringRange: StringRange;
}

/**
 * Utility class for detecting JSON string ranges and newline escape sequences
 */
export class JsonStringDetector {
    /**
     * Find all string ranges in a JSON document
     * @param document The VSCode text document to analyze
     * @returns Array of string ranges found in the document
     */
    public findStringRanges(document: vscode.TextDocument): StringRange[] {
        const text = document.getText();
        const ranges: StringRange[] = [];
        
        try {
            // Parse the JSON to validate structure
            JSON.parse(text);
            
            // Find string literals in the JSON
            let i = 0;
            while (i < text.length) {
                if (text[i] === '"') {
                    const stringStart = i;
                    i++; // Skip opening quote
                    
                    // Find the end of the string, handling escape sequences
                    let stringEnd = -1;
                    while (i < text.length) {
                        if (text[i] === '\\') {
                            // Skip escaped character
                            i += 2;
                        } else if (text[i] === '"') {
                            stringEnd = i;
                            break;
                        } else {
                            i++;
                        }
                    }
                    
                    if (stringEnd !== -1) {
                        // Extract the string content (without quotes)
                        const stringContent = text.substring(stringStart + 1, stringEnd);
                        const hasNewlines = this.containsNewlines(stringContent);
                        
                        // Convert character positions to VSCode positions
                        const startPos = document.positionAt(stringStart);
                        const endPos = document.positionAt(stringEnd + 1);
                        
                        ranges.push({
                            start: startPos,
                            end: endPos,
                            content: stringContent,
                            hasNewlines
                        });
                        
                        i = stringEnd + 1;
                    } else {
                        // Malformed string, skip
                        break;
                    }
                } else {
                    i++;
                }
            }
        } catch (error) {
            // JSON is malformed, return empty array
            console.warn('JsonStringDetector: Malformed JSON detected, skipping string detection');
            return [];
        }
        
        return ranges;
    }

    /**
     * Check if a string contains newline escape sequences
     * @param text The string to check
     * @returns True if the string contains \n sequences
     */
    public containsNewlines(text: string): boolean {
        // Look for \n that is not part of \\n (escaped backslash + n)
        let i = 0;
        while (i < text.length - 1) {
            if (text[i] === '\\' && text[i + 1] === 'n') {
                // Count consecutive backslashes before this position
                let backslashCount = 0;
                let j = i - 1;
                while (j >= 0 && text[j] === '\\') {
                    backslashCount++;
                    j--;
                }
                
                // If there's an even number of backslashes before \n, then \n is real
                // If there's an odd number, then the last backslash escapes the \, making it \\n
                if (backslashCount % 2 === 0) {
                    return true;
                }
                
                i += 2;
            } else {
                i++;
            }
        }
        return false;
    }

    /**
     * Extract positions of all newline escape sequences in a document
     * @param document The VSCode text document
     * @returns Array of positions where \n sequences are found
     */
    public extractNewlinePositions(document: vscode.TextDocument): NewlinePosition[] {
        const stringRanges = this.findStringRanges(document);
        const positions: NewlinePosition[] = [];
        
        for (const stringRange of stringRanges) {
            if (stringRange.hasNewlines) {
                const newlinePositions = this.findNewlinePositionsInString(document, stringRange);
                positions.push(...newlinePositions);
            }
        }
        
        return positions;
    }

    /**
     * Find all newline positions within a specific string range
     * @param document The VSCode text document
     * @param stringRange The string range to search within
     * @returns Array of newline positions within the string
     */
    private findNewlinePositionsInString(document: vscode.TextDocument, stringRange: StringRange): NewlinePosition[] {
        const positions: NewlinePosition[] = [];
        const text = document.getText();
        
        // Get the absolute start position of the string content (after opening quote)
        const stringStartOffset = document.offsetAt(stringRange.start) + 1;
        const stringEndOffset = document.offsetAt(stringRange.end) - 1;
        
        let i = stringStartOffset;
        while (i < stringEndOffset - 1) { // -1 because we need to check i+1
            if (text[i] === '\\' && text[i + 1] === 'n') {
                const position = document.positionAt(i);
                positions.push({
                    position,
                    stringRange
                });
                i += 2; // Skip both characters of the escape sequence
            } else if (text[i] === '\\') {
                // Skip other escape sequences
                i += 2;
            } else {
                i++;
            }
        }
        
        return positions;
    }

    /**
     * Check if a position is within a JSON string
     * @param document The VSCode text document
     * @param position The position to check
     * @returns The string range if position is within a string, null otherwise
     */
    public getStringRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): StringRange | null {
        const stringRanges = this.findStringRanges(document);
        
        for (const range of stringRanges) {
            if (this.isPositionInRange(position, range)) {
                return range;
            }
        }
        
        return null;
    }

    /**
     * Helper method to check if a position is within a range
     */
    private isPositionInRange(position: vscode.Position, range: StringRange): boolean {
        return position.isAfterOrEqual(range.start) && position.isBefore(range.end);
    }

    /**
     * Get the character offset for a VSCode Position in the document
     * @param document The VSCode text document
     * @param position The position to convert
     * @returns The character offset in the document
     */
    public positionToOffset(document: vscode.TextDocument, position: vscode.Position): number {
        return document.offsetAt(position);
    }

    /**
     * Convert a character offset to a VSCode Position
     * @param document The VSCode text document
     * @param offset The character offset in the document
     * @returns The VSCode Position object
     */
    public offsetToPosition(document: vscode.TextDocument, offset: number): vscode.Position {
        return document.positionAt(offset);
    }

    /**
     * Get detailed information about newline positions including their context
     * @param document The VSCode text document
     * @returns Array of detailed newline position information
     */
    public getDetailedNewlinePositions(document: vscode.TextDocument): DetailedNewlinePosition[] {
        const stringRanges = this.findStringRanges(document);
        const positions: DetailedNewlinePosition[] = [];
        
        for (const stringRange of stringRanges) {
            if (stringRange.hasNewlines) {
                const newlinePositions = this.findDetailedNewlinePositionsInString(document, stringRange);
                positions.push(...newlinePositions);
            }
        }
        
        return positions;
    }

    /**
     * Find detailed newline positions within a specific string range
     * @param document The VSCode text document
     * @param stringRange The string range to search within
     * @returns Array of detailed newline positions within the string
     */
    private findDetailedNewlinePositionsInString(document: vscode.TextDocument, stringRange: StringRange): DetailedNewlinePosition[] {
        const positions: DetailedNewlinePosition[] = [];
        const text = document.getText();
        
        // Get the absolute start position of the string content (after opening quote)
        const stringStartOffset = document.offsetAt(stringRange.start) + 1;
        const stringEndOffset = document.offsetAt(stringRange.end) - 1;
        
        let i = stringStartOffset;
        let newlineIndex = 0;
        
        while (i < stringEndOffset - 1) { // -1 because we need to check i+1
            if (text[i] === '\\' && text[i + 1] === 'n') {
                // Count consecutive backslashes before this position to determine if it's a real \n
                let backslashCount = 0;
                let j = i - 1;
                while (j >= stringStartOffset && text[j] === '\\') {
                    backslashCount++;
                    j--;
                }
                
                // If there's an even number of backslashes before \n, then \n is real
                if (backslashCount % 2 === 0) {
                    const position = document.positionAt(i);
                    const endPosition = document.positionAt(i + 2);
                    
                    positions.push({
                        position,
                        endPosition,
                        stringRange,
                        offset: i,
                        endOffset: i + 2,
                        indexInString: newlineIndex,
                        beforeText: text.substring(stringStartOffset, i),
                        afterText: text.substring(i + 2, stringEndOffset)
                    });
                    
                    newlineIndex++;
                }
                
                i += 2; // Skip both characters of the escape sequence
            } else if (text[i] === '\\') {
                // Skip other escape sequences
                i += 2;
            } else {
                i++;
            }
        }
        
        return positions;
    }

    /**
     * Calculate the visual position of a newline within its string context
     * This helps determine where the visual line break should appear
     * @param document The VSCode text document
     * @param newlinePosition The newline position to analyze
     * @returns Visual position information
     */
    public calculateVisualPosition(document: vscode.TextDocument, newlinePosition: DetailedNewlinePosition): VisualPositionInfo {
        const stringContent = newlinePosition.stringRange.content;
        const beforeNewline = newlinePosition.beforeText;
        
        // Count how many visual lines this newline creates
        const linesBeforeThisNewline = (beforeNewline.match(/\\n/g) || []).length;
        
        // Calculate the visual line and character position
        const lines = stringContent.split('\\n');
        const currentLineIndex = linesBeforeThisNewline;
        const currentLineContent = lines[currentLineIndex] || '';
        
        return {
            visualLine: currentLineIndex,
            visualCharacter: currentLineContent.length,
            totalVisualLines: lines.length,
            currentLineContent,
            isLastNewlineInString: newlinePosition.indexInString === this.countNewlinesInString(stringContent) - 1
        };
    }

    /**
     * Count the total number of newlines in a string
     * @param text The string to analyze
     * @returns The number of \n sequences found
     */
    private countNewlinesInString(text: string): number {
        let count = 0;
        let i = 0;
        
        while (i < text.length - 1) {
            if (text[i] === '\\' && text[i + 1] === 'n') {
                // Count consecutive backslashes before this position
                let backslashCount = 0;
                let j = i - 1;
                while (j >= 0 && text[j] === '\\') {
                    backslashCount++;
                    j--;
                }
                
                // If there's an even number of backslashes before \n, then \n is real
                if (backslashCount % 2 === 0) {
                    count++;
                }
                
                i += 2;
            } else {
                i++;
            }
        }
        
        return count;
    }
}

/**
 * Extended interface for detailed newline position information
 */
export interface DetailedNewlinePosition extends NewlinePosition {
    endPosition: vscode.Position;
    offset: number;
    endOffset: number;
    indexInString: number;
    beforeText: string;
    afterText: string;
}

/**
 * Interface for visual position information
 */
export interface VisualPositionInfo {
    visualLine: number;
    visualCharacter: number;
    totalVisualLines: number;
    currentLineContent: string;
    isLastNewlineInString: boolean;
}