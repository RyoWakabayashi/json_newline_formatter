# Changelog

All notable changes to the JSON Newline Formatter extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2024-01-15

### Added

- Initial release of JSON Newline Formatter extension
- Visual display of `\n` escape sequences as actual line breaks in JSON files
- Seamless editing with automatic conversion between visual line breaks and escape sequences
- Toggle command to switch between formatted and raw JSON view
- Keyboard shortcut support (`Ctrl+Shift+J` / `Cmd+Shift+J`)
- Status bar integration with visual formatting state indicator
- Context menu integration for easy access to toggle functionality
- Support for both `.json` and `.jsonc` file types
- Comprehensive error handling for malformed JSON files
- Performance optimizations for large JSON files
- Integration with VSCode features (Find/Replace, code folding, auto-completion)
- Copy/paste functionality that preserves JSON structure
- Extensive test suite covering core functionality and edge cases
- Configuration options for startup behavior and status bar display

### Features

- **DecorationManager**: Handles visual transformation using VSCode decorations
- **EditSynchronizer**: Manages bidirectional synchronization between visual and actual content
- **JsonStringDetector**: Identifies string values containing newline escape sequences
- **SearchHandler**: Ensures compatibility with VSCode's Find/Replace functionality
- **JsonFeatureIntegration**: Maintains compatibility with JSON language features

### Technical Details

- Built with TypeScript for type safety and better development experience
- Uses VSCode's Decoration API for non-intrusive visual enhancements
- Implements custom text editing logic for seamless content synchronization
- Includes comprehensive unit and integration tests
- Follows VSCode extension best practices and guidelines

### Documentation

- Complete README with usage instructions and examples
- Sample JSON files demonstrating extension functionality
- Troubleshooting guide for common issues
- Configuration documentation for available settings

[Unreleased]: https://github.com/your-username/json-newline-formatter/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/your-username/json-newline-formatter/releases/tag/v0.0.1
