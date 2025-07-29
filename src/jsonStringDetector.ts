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
 * Represents the result of JSON parsing operations
 */
export interface JsonParsingResult {
    isValid: boolean;
    error?: string;
    errorPosition?: vscode.Position;
    stringRanges: StringRange[];
}

/**
 * Error types for JSON parsing failures
 */
export enum JsonParsingError {
    SYNTAX_ERROR = 'syntax_error',
    UNEXPECTED_TOKEN = 'unexpected_token',
    UNTERMINATED_STRING = 'unterminated_string',
    INVALID_ESCAPE_SEQUENCE = 'invalid_escape_sequence',
    UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Represents a position of a newline escape sequence within a string
 */
export interface NewlinePosition {
    position: vscode.Position;
    stringRange: StringRange;
}

/**
 * Performance metrics for JSON processing
 */
export interface PerformanceMetrics {
    parseTime: number;
    stringCount: number;
    newlineCount: number;
    fileSize: number;
    isLargeFile: boolean;
}

/**
 * Utility class for detecting JSON string ranges and newline escape sequences
 */
export class JsonStringDetector {
    private performanceMetrics: PerformanceMetrics | null = null;
    /**
     * Find all string ranges in a JSON document
     * @param document The VSCode text document to analyze
     * @returns Array of string ranges found in the document
     */
    public findStringRanges(document: vscode.TextDocument): StringRange[] {
        const result = this.parseJsonSafely(document);
        return result.stringRanges;
    }

    /**
     * Safely parse JSON document and extract string ranges with comprehensive error handling
     * @param document The VSCode text document to analyze
     * @returns JsonParsingResult with validation status and string ranges
     */
    public parseJsonSafely(document: vscode.TextDocument): JsonParsingResult {
        const startTime = Date.now();
        const text = document.getText();
        const fileSize = text.length;
        const isLargeFile = fileSize > 100 * 1024; // 100KB threshold
        
        try {
            // First, validate the JSON structure
            JSON.parse(text);
            
            // If JSON is valid, proceed with string detection
            const stringRanges = this.extractStringRangesFromValidJson(document, text);
            
            // Calculate performance metrics
            const parseTime = Date.now() - startTime;
            const newlineCount = stringRanges.reduce((count, range) => 
                count + (range.hasNewlines ? this.countNewlinesInString(range.content) : 0), 0
            );
            
            this.performanceMetrics = {
                parseTime,
                stringCount: stringRanges.length,
                newlineCount,
                fileSize,
                isLargeFile
            };
            
            // Log performance warning for slow operations
            if (parseTime > 1000) { // 1 second threshold
                console.warn('JsonStringDetector: Slow JSON parsing detected', {
                    parseTime,
                    fileSize,
                    stringCount: stringRanges.length,
                    fileName: document.fileName
                });
            }
            
            return {
                isValid: true,
                stringRanges
            };
            
        } catch (error) {
            // Handle different types of JSON parsing errors
            const errorInfo = this.categorizeJsonError(error, text);
            
            // Calculate basic performance metrics even for failed parsing
            const parseTime = Date.now() - startTime;
            this.performanceMetrics = {
                parseTime,
                stringCount: 0,
                newlineCount: 0,
                fileSize,
                isLargeFile
            };
            
            // Log the error for debugging
            console.warn('JsonStringDetector: JSON parsing failed', {
                error: errorInfo.error,
                position: errorInfo.errorPosition,
                fileName: document.fileName,
                parseTime
            });
            
            // Show user notification for parsing errors
            this.notifyUserOfJsonError(errorInfo, document);
            
            return {
                isValid: false,
                error: errorInfo.error,
                errorPosition: errorInfo.errorPosition,
                stringRanges: [] // Return empty array for malformed JSON
            };
        }
    }

    /**
     * Extract string ranges from valid JSON text with performance optimizations
     * @param document The VSCode text document
     * @param text The JSON text content
     * @returns Array of string ranges
     */
    private extractStringRangesFromValidJson(document: vscode.TextDocument, text: string): StringRange[] {
        const ranges: StringRange[] = [];
        
        try {
            // Performance optimization: For very large files, limit processing
            const maxFileSize = 1024 * 1024; // 1MB limit
            if (text.length > maxFileSize) {
                console.warn('JsonStringDetector: File too large, applying performance limits');
                return this.extractStringRangesWithLimits(document, text, maxFileSize);
            }
            
            // Find string literals in the JSON with enhanced escape sequence handling
            let i = 0;
            let stringCount = 0;
            const maxStrings = 10000; // Limit number of strings processed for performance
            
            while (i < text.length && stringCount < maxStrings) {
                if (text[i] === '"') {
                    const stringResult = this.extractSingleStringRange(document, text, i);
                    if (stringResult) {
                        ranges.push(stringResult.range);
                        i = stringResult.nextIndex;
                        stringCount++;
                    } else {
                        // Failed to extract string, skip to next character
                        i++;
                    }
                } else {
                    i++;
                }
            }
            
            if (stringCount >= maxStrings) {
                console.warn('JsonStringDetector: Reached maximum string limit for performance');
            }
            
        } catch (error) {
            console.warn('JsonStringDetector: Error during string extraction from valid JSON', error);
            // Return partial results if we encountered an error during string extraction
        }
        
        return ranges;
    }

    /**
     * Extract string ranges with performance limits for large files
     * @param document The VSCode text document
     * @param text The JSON text content
     * @param limit The character limit to process
     * @returns Array of string ranges
     */
    private extractStringRangesWithLimits(document: vscode.TextDocument, text: string, limit: number): StringRange[] {
        const ranges: StringRange[] = [];
        const limitedText = text.substring(0, limit);
        
        try {
            // Process only the limited portion of the text
            let i = 0;
            while (i < limitedText.length) {
                if (limitedText[i] === '"') {
                    const stringResult = this.extractSingleStringRange(document, limitedText, i);
                    if (stringResult) {
                        ranges.push(stringResult.range);
                        i = stringResult.nextIndex;
                    } else {
                        i++;
                    }
                } else {
                    i++;
                }
            }
        } catch (error) {
            console.warn('JsonStringDetector: Error during limited string extraction', error);
        }
        
        return ranges;
    }

    /**
     * Extract a single string range from JSON text
     * @param document The VSCode text document
     * @param text The JSON text content
     * @param startIndex The starting index of the string (at the opening quote)
     * @returns Object with the string range and next index, or null if extraction failed
     */
    private extractSingleStringRange(document: vscode.TextDocument, text: string, startIndex: number): {
        range: StringRange;
        nextIndex: number;
    } | null {
        if (text[startIndex] !== '"') {
            return null;
        }
        
        const stringStart = startIndex;
        let i = startIndex + 1; // Skip opening quote
        
        // Find the end of the string, handling complex escape sequences
        let stringEnd = -1;
        while (i < text.length) {
            if (text[i] === '\\') {
                // Handle escape sequences with enhanced validation
                if (i + 1 < text.length) {
                    const nextChar = text[i + 1];
                    if (nextChar === 'u') {
                        // Unicode escape sequence: \uXXXX
                        if (i + 5 < text.length && this.isValidUnicodeEscape(text.substring(i + 2, i + 6))) {
                            i += 6; // Skip \uXXXX
                        } else {
                            // Invalid unicode escape, but continue parsing
                            i += 2;
                        }
                    } else if (this.isValidEscapeSequence(nextChar)) {
                        i += 2; // Skip valid escape sequence
                    } else {
                        // Invalid escape sequence, but continue parsing
                        i += 2;
                    }
                } else {
                    // Incomplete escape at end of file
                    break;
                }
            } else if (text[i] === '"') {
                stringEnd = i;
                break;
            } else if (text[i] < ' ' && text[i] !== '\t') {
                // Control characters (except tab) are not allowed in JSON strings
                // This shouldn't happen with valid JSON, but handle gracefully
                i++;
            } else {
                i++;
            }
        }
        
        if (stringEnd === -1) {
            // Unterminated string
            return null;
        }
        
        try {
            // Extract the string content (without quotes)
            const stringContent = text.substring(stringStart + 1, stringEnd);
            const hasNewlines = this.containsNewlines(stringContent);
            
            // Convert character positions to VSCode positions
            const startPos = document.positionAt(stringStart);
            const endPos = document.positionAt(stringEnd + 1);
            
            return {
                range: {
                    start: startPos,
                    end: endPos,
                    content: stringContent,
                    hasNewlines
                },
                nextIndex: stringEnd + 1
            };
        } catch (error) {
            console.warn('JsonStringDetector: Error creating string range', error);
            return null;
        }
    }

    /**
     * Check if a 4-character string is a valid Unicode escape sequence
     * @param hexChars The 4 hex characters after \u
     * @returns True if valid hex characters
     */
    private isValidUnicodeEscape(hexChars: string): boolean {
        if (hexChars.length !== 4) {
            return false;
        }
        
        return /^[0-9a-fA-F]{4}$/.test(hexChars);
    }

    /**
     * Categorize JSON parsing errors for better user feedback
     * @param error The caught error object
     * @param text The JSON text that failed to parse
     * @returns Categorized error information
     */
    private categorizeJsonError(error: any, text: string): { error: string; errorPosition?: vscode.Position } {
        const errorMessage = error.message || error.toString();
        
        // Try to extract position information from error message
        let errorPosition: vscode.Position | undefined;
        
        // Common JSON error patterns
        if (errorMessage.includes('Unexpected token')) {
            const positionMatch = errorMessage.match(/position (\d+)/);
            if (positionMatch) {
                const position = parseInt(positionMatch[1], 10);
                errorPosition = this.offsetToPositionInText(text, position);
            }
            return {
                error: `Invalid JSON syntax: ${errorMessage}`,
                errorPosition
            };
        } else if (errorMessage.includes('Unterminated string')) {
            return {
                error: 'Unterminated string in JSON',
                errorPosition
            };
        } else if (errorMessage.includes('Unexpected end of JSON input')) {
            return {
                error: 'Incomplete JSON structure',
                errorPosition
            };
        } else {
            return {
                error: `JSON parsing error: ${errorMessage}`,
                errorPosition
            };
        }
    }



    /**
     * Check if a character represents a valid JSON escape sequence
     * @param char The character following the backslash
     * @returns True if it's a valid escape sequence
     */
    private isValidEscapeSequence(char: string): boolean {
        return ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'].includes(char);
    }

    /**
     * Notify user of JSON parsing errors with appropriate actions
     * @param errorInfo The categorized error information
     * @param document The document that failed to parse
     */
    private notifyUserOfJsonError(errorInfo: { error: string; errorPosition?: vscode.Position }, document: vscode.TextDocument): void {
        const fileName = document.fileName.split('/').pop() || 'JSON file';
        
        // Create user-friendly error message
        const message = `JSON Newline Formatter: Cannot process ${fileName} - ${errorInfo.error}`;
        
        // Show error notification with option to go to error position
        if (errorInfo.errorPosition) {
            vscode.window.showErrorMessage(message, 'Go to Error').then(selection => {
                if (selection === 'Go to Error') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document === document) {
                        editor.selection = new vscode.Selection(errorInfo.errorPosition!, errorInfo.errorPosition!);
                        editor.revealRange(new vscode.Range(errorInfo.errorPosition!, errorInfo.errorPosition!));
                    }
                }
            });
        } else {
            vscode.window.showErrorMessage(message);
        }
    }

    /**
     * Check if a string contains newline escape sequences
     * @param text The string to check
     * @returns True if the string contains \n sequences
     */
    public containsNewlines(text: string): boolean {
        return this.findNewlineEscapeSequences(text).length > 0;
    }

    /**
     * Find all newline escape sequences in a string, handling complex escape patterns
     * @param text The string to analyze
     * @returns Array of positions where real \n sequences are found
     */
    private findNewlineEscapeSequences(text: string): number[] {
        const positions: number[] = [];
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
                    positions.push(i);
                }
                
                i += 2;
            } else {
                i++;
            }
        }
        
        return positions;
    }

    /**
     * Extract positions of all newline escape sequences in a document
     * @param document The VSCode text document
     * @returns Array of positions where \n sequences are found
     */
    public extractNewlinePositions(document: vscode.TextDocument): NewlinePosition[] {
        const result = this.parseJsonSafely(document);
        
        // If JSON is invalid, return empty array
        if (!result.isValid) {
            return [];
        }
        
        const positions: NewlinePosition[] = [];
        
        try {
            for (const stringRange of result.stringRanges) {
                if (stringRange.hasNewlines) {
                    const newlinePositions = this.findNewlinePositionsInString(document, stringRange);
                    positions.push(...newlinePositions);
                }
            }
        } catch (error) {
            console.warn('JsonStringDetector: Error extracting newline positions', error);
            // Return partial results if we encountered an error
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
        const result = this.parseJsonSafely(document);
        
        // If JSON is invalid, return null
        if (!result.isValid) {
            return null;
        }
        
        try {
            for (const range of result.stringRanges) {
                if (this.isPositionInRange(position, range)) {
                    return range;
                }
            }
        } catch (error) {
            console.warn('JsonStringDetector: Error checking string range at position', error);
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
     * Convert character offset to VSCode Position for text content
     * @param text The text content
     * @param offset The character offset
     * @returns VSCode Position object
     */
    private offsetToPositionInText(text: string, offset: number): vscode.Position {
        let line = 0;
        let character = 0;
        
        for (let i = 0; i < Math.min(offset, text.length); i++) {
            if (text[i] === '\n') {
                line++;
                character = 0;
            } else {
                character++;
            }
        }
        
        return new vscode.Position(line, character);
    }

    /**
     * Get detailed information about newline positions including their context
     * @param document The VSCode text document
     * @returns Array of detailed newline position information
     */
    public getDetailedNewlinePositions(document: vscode.TextDocument): DetailedNewlinePosition[] {
        const result = this.parseJsonSafely(document);
        
        // If JSON is invalid, return empty array
        if (!result.isValid) {
            return [];
        }
        
        const positions: DetailedNewlinePosition[] = [];
        
        try {
            for (const stringRange of result.stringRanges) {
                if (stringRange.hasNewlines) {
                    const newlinePositions = this.findDetailedNewlinePositionsInString(document, stringRange);
                    positions.push(...newlinePositions);
                }
            }
        } catch (error) {
            console.warn('JsonStringDetector: Error getting detailed newline positions', error);
            // Return partial results if we encountered an error
        }
        
        return positions;
    }

    /**
     * Find detailed newline positions within a specific string range with enhanced escape handling
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
            if (text[i] === '\\') {
                if (i + 1 < stringEndOffset) {
                    const nextChar = text[i + 1];
                    
                    if (nextChar === 'n') {
                        // Potential newline escape sequence
                        if (this.isRealNewlineEscape(text, i, stringStartOffset)) {
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
                        i += 2; // Skip \n sequence
                    } else if (nextChar === 'u') {
                        // Unicode escape sequence: \uXXXX
                        if (i + 5 < stringEndOffset && this.isValidUnicodeEscape(text.substring(i + 2, i + 6))) {
                            i += 6; // Skip \uXXXX
                        } else {
                            i += 2; // Skip invalid unicode escape
                        }
                    } else {
                        // Other escape sequences (\t, \", \\, etc.)
                        i += 2;
                    }
                } else {
                    // Incomplete escape at end of string
                    i++;
                }
            } else {
                i++;
            }
        }
        
        return positions;
    }

    /**
     * Determine if a \n sequence is a real newline escape (not escaped by preceding backslashes)
     * @param text The full text
     * @param position The position of the backslash in \n
     * @param stringStart The start of the string content
     * @returns True if it's a real newline escape
     */
    private isRealNewlineEscape(text: string, position: number, stringStart: number): boolean {
        // Count consecutive backslashes before this position
        let backslashCount = 0;
        let j = position - 1;
        
        while (j >= stringStart && text[j] === '\\') {
            backslashCount++;
            j--;
        }
        
        // If there's an even number of backslashes before \n, then \n is real
        // If there's an odd number, then the last backslash escapes the \, making it \\n
        return backslashCount % 2 === 0;
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
     * Count the total number of newlines in a string (optimized version)
     * @param text The string to analyze
     * @returns The number of \n sequences found
     */
    private countNewlinesInString(text: string): number {
        // Use the cached result from findNewlineEscapeSequences for better performance
        return this.findNewlineEscapeSequences(text).length;
    }

    /**
     * Get performance metrics from the last parsing operation
     * @returns Performance metrics or null if no parsing has been done
     */
    public getPerformanceMetrics(): PerformanceMetrics | null {
        return this.performanceMetrics;
    }

    /**
     * Check if the last parsed document was considered large
     * @returns True if the document was large and performance optimizations were applied
     */
    public isLargeDocument(): boolean {
        return this.performanceMetrics?.isLargeFile ?? false;
    }

    /**
     * Get recommendations for improving performance based on the last parsing operation
     * @returns Array of performance recommendations
     */
    public getPerformanceRecommendations(): string[] {
        const recommendations: string[] = [];
        
        if (!this.performanceMetrics) {
            return recommendations;
        }
        
        const { parseTime, fileSize, stringCount, newlineCount, isLargeFile } = this.performanceMetrics;
        
        if (isLargeFile) {
            recommendations.push('Consider splitting large JSON files into smaller chunks for better performance');
        }
        
        if (parseTime > 2000) { // 2 seconds
            recommendations.push('JSON parsing is slow - consider optimizing the JSON structure');
        }
        
        if (stringCount > 5000) {
            recommendations.push('Large number of strings detected - some features may be limited for performance');
        }
        
        if (newlineCount > 1000) {
            recommendations.push('Many newline sequences detected - rendering may be slower than usual');
        }
        
        if (fileSize > 1024 * 1024) { // 1MB
            recommendations.push('Very large file detected - some features may be disabled for performance');
        }
        
        return recommendations;
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