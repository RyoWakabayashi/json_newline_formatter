# JSON Newline Formatter

A VSCode extension that enhances the editing experience for JSON files containing escaped newline characters (`\n`). The extension automatically displays these escape sequences as actual line breaks in the editor while preserving the ability to edit the content seamlessly.

## Features

- **Visual Line Breaks**: Displays `\n` escape sequences as actual line breaks for better readability
- **Seamless Editing**: Edit multi-line content naturally without manually inserting escape sequences
- **Toggle Functionality**: Easily switch between formatted and raw JSON view
- **Status Bar Integration**: Visual indicator showing current formatting state
- **Keyboard Shortcuts**: Quick toggle with `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Shift+J` (Mac)
- **Context Menu**: Right-click to toggle formatting in JSON files
- **Preserves JSON Structure**: Original file format remains intact with proper escape sequences

## Installation

1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "JSON Newline Formatter"
4. Click Install

## Usage

### Basic Usage

1. Open any JSON file containing `\n` escape sequences
2. The extension automatically detects and formats newline characters
3. Use the toggle command to switch between formatted and raw view

### Toggle Formatting

You can toggle the formatting in several ways:

- **Keyboard Shortcut**: `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Shift+J` (Mac)
- **Command Palette**: Open Command Palette (`Ctrl+Shift+P`) and search for "Toggle JSON Newline Formatting"
- **Status Bar**: Click the status bar indicator when viewing JSON files
- **Context Menu**: Right-click in a JSON file and select "Toggle JSON Newline Formatting"

### Status Bar Indicator

When viewing JSON files, you'll see a status bar indicator:

- `$(symbol-string) JSON \n` - Formatting is enabled
- `$(symbol-string) JSON` - Formatting is disabled (with warning background)

## Examples

### Before (Raw JSON)

```json
{
  "message": "Hello\\nWorld\\nThis is a multi-line\\nstring with newlines",
  "description": "Line 1\\nLine 2\\nLine 3"
}
```

### After (Formatted View)

```json
{
  "message": "Hello
World
This is a multi-line
string with newlines",
  "description": "Line 1
Line 2
Line 3"
}
```

## Configuration

The extension provides the following configuration options:

### Settings

- `json-newline-formatter.enableOnStartup`: Enable formatting when opening JSON files (default: `true`)
- `json-newline-formatter.showStatusBar`: Show status bar indicator (default: `true`)

To configure these settings:

1. Open VSCode Settings (`Ctrl+,`)
2. Search for "JSON Newline Formatter"
3. Adjust the settings as needed

## Supported File Types

- `.json` files
- `.jsonc` files (JSON with Comments)

## How It Works

The extension uses VSCode's Decoration API to create a visual overlay that displays `\n` escape sequences as actual line breaks. When you edit the formatted content:

1. Your changes are automatically synchronized with the underlying JSON structure
2. New line breaks are converted to `\n` escape sequences
3. The file maintains valid JSON format when saved
4. All VSCode features (syntax highlighting, folding, etc.) continue to work normally

## Troubleshooting

### Common Issues

#### Extension Not Working

- **Problem**: Formatting doesn't appear in JSON files
- **Solution**: 
  - Ensure the file has `.json` or `.jsonc` extension
  - Check if formatting is enabled via the status bar or toggle command
  - Verify the JSON is valid (malformed JSON disables formatting)

#### Performance Issues

- **Problem**: Extension slows down with large JSON files
- **Solution**: 
  - The extension automatically optimizes for large files
  - Consider breaking very large JSON files into smaller chunks
  - Disable formatting for extremely large files if needed

#### Editing Problems

- **Problem**: Edits don't sync properly between formatted and raw view
- **Solution**:
  - Save the file to ensure synchronization
  - Toggle formatting off and on to refresh
  - Check for any JSON syntax errors

#### Status Bar Not Showing

- **Problem**: Status bar indicator is missing
- **Solution**:
  - Ensure you're viewing a JSON file
  - Check the `json-newline-formatter.showStatusBar` setting
  - Restart VSCode if the issue persists

### Advanced Troubleshooting

#### JSON Parsing Errors

If the extension encounters malformed JSON:

- A warning will appear in the status bar
- Formatting will be automatically disabled
- Fix the JSON syntax errors to re-enable formatting

#### Extension Conflicts

If you experience conflicts with other JSON extensions:

- Try disabling other JSON-related extensions temporarily
- Check the VSCode Developer Console (`Help > Toggle Developer Tools`) for error messages
- Report conflicts as issues on the GitHub repository

## Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| Toggle Formatting | `Ctrl+Shift+J` | `Cmd+Shift+J` |

## Contributing

Found a bug or have a feature request? Please visit our [GitHub repository](https://github.com/your-username/json-newline-formatter) to:

- Report issues
- Submit feature requests  
- Contribute code improvements

## License

This extension is licensed under the MIT License. See the LICENSE file for details.

## Changelog

### 0.0.1

- Initial release
- Basic newline formatting functionality
- Toggle command and status bar integration
- Keyboard shortcuts and context menu support

---

**Enjoy better JSON editing with visual line breaks!** 🎉
