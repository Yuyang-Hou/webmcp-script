# WebMCP Script v0.3

## Purpose
独立网站脚本管理器与标准 MCP 本地桥接。项目不依赖原 Playwriter/Tabwright 仓库，不修改业务 Skills。

## Requirements

### Requirement: Independent script lifecycle
The product SHALL import, inspect, enable, disable, replace and uninstall independently distributed scripts through Chromium userScripts APIs without eval.

#### Scenario: Install and update a site script
- **WHEN** the user imports or replaces a valid file
- **THEN** the matching pages expose the current script tools without rebuilding the extension

#### Scenario: Disable or uninstall
- **WHEN** the user disables or uninstalls a script
- **THEN** its tools are removed and old revisions reject invocation

### Requirement: Current capability discovery
The product SHALL return current summaries after visit, inspection and invocation, provide full schemas on demand, and bind calls to a document and registration revision.

#### Scenario: Navigation or registration change
- **WHEN** a document, SPA route or registration changes
- **THEN** old revisions fail and new inspection returns fresh capabilities without duplicate registrations

### Requirement: Recovery and authorization boundary
The product SHALL expose errors and reconnect transport without automatically replaying uncertain operations. Tool metadata SHALL NOT constitute user authorization.

#### Scenario: Disconnected invocation
- **WHEN** a connection closes during invocation
- **THEN** the outcome is marked potentially unknown and is not automatically retried

### Requirement: Evidence-based compatibility
The product SHALL deliver a loadable extension, standalone public demo scripts, real Chromium MCP end-to-end evidence, and an actual Codex embedded-browser probe or precise blocking evidence.

#### Scenario: Native runtime unavailable
- **WHEN** the embedded browser cannot install or run the script through a supported entry point
- **THEN** the report states the limitation and minimum manual step without claiming persistence or modifying the running host

### Requirement: Native registration cleanup without unregisterTool
The runtime SHALL register native tools with owned AbortSignals and SHALL clean them up on route exit even when the host does not expose unregisterTool.

#### Scenario: Codex native host route transition
- **WHEN** an active script leaves its matching SPA route
- **THEN** the host tool list becomes empty, old handles reject, and returning restores one registration per tool

#### Scenario: Same standalone file in both hosts
- **WHEN** the local native demo serves a distributed userscript
- **THEN** its response bytes match the extension-importable artifact and Codex can discover and invoke it without a separate MCP bridge

### Requirement: Reviewed and recoverable installation
The manager SHALL preview metadata, scope, source and effective enabled state before installing, replacing or restoring a script, preserve disabled state on update and retain one previous source revision.

#### Scenario: Cancel or stale preview
- **WHEN** the user cancels a preview or the existing script changes before confirmation
- **THEN** the pending source is not installed

#### Scenario: Restore or storage failure
- **WHEN** the user confirms a previous-version restore
- **THEN** the previous source replaces the current source through the same preview checks
- **WHEN** persistence fails after applying a script
- **THEN** the manager attempts to restore previous registrations and reports any rollback failure

### Requirement: Shared local relay
Multiple MCP clients SHALL share one authenticated loopback relay while isolating request identifiers and responses, without replaying tool calls.

#### Scenario: Independent client lifetime
- **WHEN** one client disconnects during an invocation
- **THEN** its late result is not delivered to another client and remaining clients continue working

#### Scenario: Idle exit and restart
- **WHEN** no MCP clients remain for the idle period
- **THEN** the relay exits and a later client automatically starts it again

### Requirement: Focused script workspace
The manager SHALL separate script management from connection settings, allow name, ID and scope search and enabled-state filtering, and confirm removal before deleting current and previous sources.

#### Scenario: Empty search and narrow screen
- **WHEN** a search has no results
- **THEN** the user can clear filters to restore the list
- **WHEN** the viewport is 390 pixels wide
- **THEN** the manager remains usable without horizontal overflow

#### Scenario: Cancel removal
- **WHEN** the user cancels the removal dialog
- **THEN** the script and its tools remain installed
