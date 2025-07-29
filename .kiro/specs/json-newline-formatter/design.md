# Design Document

## Overview

The JSON Newline Formatter extension will use VSCode's Decoration API and Text Document Content Provider to create a virtual view layer that displays `\n` escape sequences as actual line breaks while maintaining the underlying JSON structure. The extension will implement custom text editing logic to synchronize changes between the visual representation and the actual file content.

## Architecture

The extension follows a Model-View-Controller pattern:

- **Model**: Original JSON file content with escape sequences
- **View**: Decorated editor display with visual line breaks  
- **Controller**: Extension logic that manages synchronization between model and view

### Core Components

1. **Decoration Manager**: Handles visual transformation using VSCode decorations
2. **Edit Synchronizer**: Manages bidirectional synchronization between visual edits and file content
3. **JSON Parser**: Identifies string values containing `\n` sequences
4. **Command Handler**: Provides toggle functionality and user commands

## Components and Interfaces

### 1. Decoration Manager

```typescript
interface DecorationManager {
  applyDecorations(document: TextDocument): void;
  clearDecorations(): void;
  updateDecorations(changes: TextDocumentChangeEvent): void;
}
```

**Responsibilities:**
- Parse JSON to identify string values with `\n` sequences
- Create decoration ranges for each `\n` occurrence
- Apply `after` decorations to render visual line breaks
- Update decorations when document changes

### 2. Edit Synchronizer

```typescript
interface EditSynchronizer {
  onWillSaveDocument(document: TextDocument): void;
  onDidChangeTextDocument(event: TextDocumentChangeEvent): void;
  transformVisualToActual(edit: TextEdit): TextEdit;
  transformActualToVisual(position: Position): Position;
}
```

**Responsibilities:**
- Intercept text changes in decorated areas
- Convert visual line breaks to `\n` escape sequences
- Convert `\n` sequences to visual breaks during display
- Maintain cursor position mapping between visual and actual content

### 3. JSON String Detector

```typescript
interface JsonStringDetector {
  findStringRanges(document: TextDocument): StringRange[];
  containsNewlines(text: string): boolean;
  extractNewlinePositions(text: string, offset: number): Position[];
}

interface StringRange {
  start: Position;
  end: Position;
  content: string;
  hasNewlines: boolean;
}
```

**Responsibilities:**
- Parse JSON structure to identify string values
- Detect which strings contain `\n` escape sequences
- Provide position information for decoration placement

### 4. Extension Controller

```typescript
interface ExtensionController {
  activate(context: ExtensionContext): void;
  deactivate(): void;
  toggleFormatting(): void;
  isFormattingEnabled(): boolean;
}
```

**Responsibilities:**
- Manage extension lifecycle
- Register commands and event listeners
- Coordinate between other components
- Handle user preferences and settings

## Data Models

### Decoration Data

```typescript
interface NewlineDecoration {
  range: Range;           // Position of \n in original text
  renderText: string;     // Empty string (line break is visual)
  isActive: boolean;      // Whether decoration is currently applied
}

interface DecorationState {
  decorations: NewlineDecoration[];
  decorationType: TextEditorDecorationType;
  isEnabled: boolean;
}
```

### Edit Mapping

```typescript
interface EditMapping {
  visualPosition: Position;
  actualPosition: Position;
  offset: number;         // Character offset due to \n -> line break conversion
}

interface DocumentState {
  originalContent: string;
  visualContent: string;
  mappings: EditMapping[];
  version: number;
}
```

## Implementation Strategy

### Phase 1: Basic Decoration Display

1. **JSON Parsing**: Use a lightweight JSON parser to identify string boundaries
2. **Decoration Creation**: Create `after` decorations with `\n` content rendered as line breaks
3. **Visual Rendering**: Apply decorations to show line breaks without modifying file content

### Phase 2: Edit Synchronization

1. **Change Detection**: Listen to `onDidChangeTextDocument` events
2. **Position Mapping**: Maintain mapping between visual positions and actual file positions
3. **Content Transformation**: Convert between visual content (with line breaks) and actual content (with `\n`)

### Phase 3: Advanced Features

1. **Command Integration**: Add toggle command and status bar indicator
2. **Settings Support**: Allow users to configure behavior
3. **Performance Optimization**: Implement efficient decoration updates for large files

## Error Handling

### JSON Parsing Errors
- **Strategy**: Graceful degradation - disable formatting for malformed JSON
- **Implementation**: Wrap JSON parsing in try-catch, fall back to plain text mode
- **User Feedback**: Show warning in status bar when JSON is invalid

### Edit Synchronization Errors
- **Strategy**: Conflict resolution with user notification
- **Implementation**: Detect when visual and actual content diverge, prompt user to choose
- **Recovery**: Provide command to reset formatting and reload file

### Performance Issues
- **Strategy**: Lazy loading and incremental updates
- **Implementation**: Only process visible editor ranges, debounce decoration updates
- **Monitoring**: Track decoration count and processing time, disable for very large files

## Testing Strategy

### Unit Tests
- JSON string detection accuracy
- Position mapping correctness
- Content transformation bidirectionality
- Edge case handling (nested objects, arrays, special characters)

### Integration Tests
- VSCode API interaction
- Decoration rendering verification
- Edit synchronization end-to-end
- Command execution and state management

### Manual Testing Scenarios
- Large JSON files with multiple string fields
- Complex nested JSON structures
- Rapid editing and cursor movement
- Copy/paste operations across formatted content
- Find/replace functionality with formatted text

### Performance Tests
- Memory usage with large files
- Decoration update performance
- Edit responsiveness with many `\n` sequences
- Extension activation time

## Technical Considerations

### VSCode API Limitations
- Decorations are view-only and cannot modify actual file content
- Text edits must be carefully synchronized to maintain JSON validity
- Position calculations must account for invisible `\n` characters

### JSON Parsing Approach
- Use streaming parser for large files to avoid memory issues
- Handle comments and trailing commas if JSON5 support is needed
- Preserve exact formatting and whitespace in non-string areas

### User Experience
- Provide clear visual indicators when formatting is active
- Ensure smooth cursor movement across visual line breaks
- Maintain familiar editing behaviors (selection, copy/paste)