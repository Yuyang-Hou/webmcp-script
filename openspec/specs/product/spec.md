# WebMCP Script native alignment

## Purpose
独立网站脚本管理器与标准 MCP 本地桥接。项目不依赖原 Playwriter/Tabwright 仓库，不修改业务 Skills。

## Requirements

### Requirement: Shared AI-managed local script library
CLI and MCP SHALL share the same local script library for preview, import, version restore, enable, disable, archival removal, immutable build, build selection and isolated launch requests.

#### Scenario: Reviewed import and concurrent modification
- **WHEN** a source file changes after preview or a different client changes the library revision
- **THEN** the old import or mutation is rejected and the previous state remains available

#### Scenario: Artifact and running state
- **WHEN** scripts are built or selected
- **THEN** the tool reports the selected next-launch version without claiming page injection
- **WHEN** a generated artifact has changed since building
- **THEN** selection and launch reject it

#### Scenario: Available without browser relay
- **WHEN** the browser relay is offline or unavailable
- **THEN** local library MCP operations remain usable and page operations establish the relay lazily

#### Scenario: Existing dedicated instance
- **WHEN** a launch request finds the library profile already running
- **THEN** it reports restartRequired instead of automatically closing user work

### Requirement: Native tool source of truth
The bridge SHALL discover tools with document.modelContext.getTools and invoke them with document.modelContext.executeTool, preserving native results. Script lifecycle metadata SHALL NOT be an alternative tool registry.

#### Scenario: Website-owned tools coexist with imported scripts
- **WHEN** a website registers a native tool independently of the script manager
- **THEN** the bridge discovers and invokes it through the same native API as imported tools
- **AND** removing imported scripts preserves website-owned registrations

#### Scenario: Native API unavailable
- **WHEN** the browser lacks native registration, discovery or invocation APIs
- **THEN** the runtime reports unsupported native WebMCP and does not emulate successful support

#### Scenario: Native API initializes after the script
- **WHEN** an installed script runs before native WebMCP becomes available
- **THEN** registration waits for up to 30 seconds and uses the native API once available
- **AND** disabling the script while waiting prevents later registration

#### Scenario: Older installed runtime
- **WHEN** an installed page runtime reports native unavailable or omits the verified native implementation marker
- **THEN** MCP discovery reports unsupported or unknown with an actionable error
- **AND** legacy private tool summaries are not presented as verified native discovery

### Requirement: Independent script lifecycle
The product SHALL import, inspect, enable, disable, replace and uninstall independently distributed scripts through Chromium userScripts APIs without eval.

#### Scenario: Install and update a site script
- **WHEN** the user imports or replaces a valid lifecycle-helper script
- **THEN** the matching pages expose the current script tools without rebuilding the extension

#### Scenario: Disable or uninstall
- **WHEN** the user disables or uninstalls a lifecycle-helper script
- **THEN** its owned tools are removed and old revisions reject invocation

### Requirement: Declarative native package
The local generator SHALL package independent reviewed userscripts into MAIN-world manifest content scripts without browser management APIs, background services or userScripts permission changes.

#### Scenario: Standard script package
- **WHEN** valid independent files are supplied to the generator
- **THEN** generated content scripts respect their match metadata and can register tools directly with the native API
- **AND** a normal page without inline scripts receives the tools through extension injection

#### Scenario: Package update boundary
- **WHEN** script files change
- **THEN** a new package and host reload are required, and the product does not claim hot updates
- **AND** invalid inputs or an existing output directory cannot overwrite a working package

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
- **THEN** that script's tools are removed, website-owned tools remain, old handles reject, and returning restores one registration per tool

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

#### Scenario: Browser toolbar entry
- **WHEN** the user opens WebMCP Script from the browser extension menu
- **THEN** the compact extension popup presents current-page native tool discovery, matching script toggles, new script and manager entries
- **AND** native page tools appear first and expand by default, ahead of script management; compact rows omit a product heading, domain block and visible script section heading
- **AND** a normal connection appears as a small footer settings entry; only a pending or failed connection moves that entry above the tools, and this status is not presented as a global enable switch
- **AND** page scripts use the same group heading style as tools but are collapsed by default, with their count shown in the heading; script rows use the same text size and white background as tool entries
- **AND** new script appears only inside the expanded page scripts group, including when its count is zero
- **AND** each script name and chevron expand keyboard-accessible checked enable state and edit/delete actions, without a persistent switch or colored row; toggling preserves both group and script expansion
- **AND** long names remain accessible through labels and full-name tooltips without widening the popup
- **AND** edit opens that installed script directly in the manager, honoring any existing unsaved draft; missing scripts report an error
- **AND** deletion requires confirmation, cancellation makes no change and a failed deletion keeps the script visible with an error
- **AND** the localhost demo is not used as the product entry point

#### Scenario: Chrome extension options
- **WHEN** the browser opens the extension options
- **THEN** the Chrome manifest requests the manager in its own tab
- **AND** compatibility reports distinguish a validated Chrome entry from an unverified Codex host entry


### Requirement: Paste-first script editor
The Chrome manager SHALL use CodeMirror 6, a compact tab rail with an integrated new-script tab, and a neutral save button disabled when unchanged. It SHALL have no file-import UI and SHALL preserve existing script installation validation.

#### Scenario: Create and update
- **WHEN** the user selects the new-script tab, pastes a complete userscript and saves
- **THEN** metadata and scope are previewed before installation and a disabled script remains disabled on update
- **AND** the previous revision is retained for restore through the same preview

#### Scenario: Unsaved work
- **WHEN** the user changes tabs or a save fails
- **THEN** the editor retains the pending source
- **WHEN** the user closes or replaces a modified editor
- **THEN** discarding requires confirmation

#### Scenario: Honest discovery
- **WHEN** a page cannot be inspected or has no native WebMCP interface
- **THEN** the manager and popup show an unavailable or unsupported state rather than zero tools
- **AND** connection status describes the local bridge connection without claiming an AI client is configured

#### Scenario: Renderer validation boundary
- **WHEN** browser UI tests run with mocked Chrome messages on an HTTP fixture
- **THEN** they are recorded as renderer tests, never installation or native invocation acceptance


#### Scenario: Extension host font defaults
- **WHEN** the host injects a body font family and percentage font size
- **THEN** the manager and popup still use the product system font stack and 13px body text
- **AND** form controls inherit that font family, manager supporting text uses 12px and popup supporting text uses 11px, and source code retains a separate monospace font
- **AND** renderer acceptance explicitly simulates host defaults and checks computed styles rather than relying on ordinary-page screenshots alone


#### Scenario: New script tab and template
- **WHEN** the user selects the new-script tab
- **THEN** that tab becomes selected and shows a prefilled editable userscript template without adding a filename tab
- **AND** the template contains standard userscript metadata with a unique namespace and a read-only native WebMCP example, without proprietary @id, WebMCPScript globals, imports or runtime dependencies
- **AND** it registers directly through document.modelContext.registerTool, aborts its own registration on pagehide and restores it on a persisted pageshow
- **AND** unavailable native APIs and registration failures are reported without a private fallback or deleting other tools
- **WHEN** the user switches away and returns to the new-script tab or selects it again
- **THEN** the current draft remains intact
- **WHEN** the user saves the new script
- **THEN** the editor stays in the new-script tab without creating another tab


#### Scenario: Transient operation feedback
- **WHEN** a completed operation such as uninstall displays a success notice
- **THEN** the notice appears outside normal layout flow and disappears after three seconds without shifting the table or editor
- **AND** actionable error messages remain visible rather than being auto-dismissed


### Requirement: Standard userscript compatibility
The manager SHALL accept userscripts without a proprietary @id by deriving a stable internal identity from namespace and name. Explicit valid IDs remain supported. Equal-label Markdown links in @match SHALL be restored to plain URL metadata before saving, without widening scope or changing executable code; ambiguous links SHALL be rejected.

#### Scenario: Paste a standard header
- **WHEN** a user pastes a script with name, namespace, version and match metadata but no id
- **THEN** preview and save succeed, version changes retain its identity and matching metadata is shown as plain URLs

#### Scenario: Native script execution
- **WHEN** a script directly uses native WebMCP without WebMCPScript.install
- **THEN** the Chrome loader executes it once per document without demanding the proprietary helper
- **WHEN** an already executed ordinary script is disabled or removed
- **THEN** the loader aborts native registrations attributed to that script; native discovery no longer returns them and cached execute callbacks reject new calls, while unrelated page tools remain
- **WHEN** that ordinary script is updated or enabled again
- **THEN** existing pages require refresh before executing it again, avoiding repeated arbitrary side effects
- **AND** partially executed scripts are not automatically retried in the same document

#### Scenario: Tool provider attribution
- **WHEN** the popup, manager or MCP exposes a native tool
- **THEN** it includes the registered script identity and display name when attributed; other tools are labeled as page-provided, and snapshots without attribution display tool names without source placeholders or refresh hints in both popup and manager
- **AND** the popup groups tools from the same provider under one supporting label, preserving each full tool name as a hover title
- **AND** attribution is captured at native registration through the loader scope and Chromium sourceURL callback stacks, not inferred from a tool name prefix
- **AND** this is lifecycle bookkeeping for trusted scripts, not a security sandbox; delegated registrations outside the script source (such as dynamically inserted script elements or external page callbacks) are not guaranteed to be attributable and must not be labeled as belonging to a known script
- **AND** script removal does not promise to undo started business operations, arbitrary DOM effects or registrations outside the supported attribution scope
- **AND** pages loaded before this lifecycle upgrade require a refresh; cleanup failures remain visible

#### Scenario: Chrome-style popup presentation
- **WHEN** the popup is displayed
- **THEN** it uses a 344px layout with consistent inline SVG outline icons, 13px system body text, 12px entries, 11px supporting text and compact rounded rows
- **AND** hover is gray, while only a disconnected or pending connection uses the pale-blue prompt; normal connection remains a small footer
- **AND** native details controls and checkbox keyboard operation remain available

#### Scenario: Compact manager header and underline tabs
- **WHEN** the user opens the manager
- **THEN** a single 48px header contains a small accessible product logo, navigation and connection status on the same row
- **AND** primary navigation uses 15px text ordered as page tools, installed scripts, new script, connection and settings; the new-script tab displays its full label instead of a plus icon
- **AND** navigation uses neutral two-pixel underlines for the active page, with no raised tab outline or selected fill
- **AND** a connected local service shows only a small dot with an accessible label and hover details; pending or failed connections also show short status text, and clicking the status opens connection settings
- **AND** long editor tabs scroll within the navigation without pushing status outside the viewport
- **AND** the labeled new-script control remains the new-script page itself, uses the same underline state and preserves its template and draft; existing-script editing and closing remain available


#### Scenario: Editor selection and tab emphasis
- **WHEN** the user drags to select part of one line or several lines
- **THEN** CodeMirror selection remains visible on the active line, using its default translucent active-line background
- **WHEN** another tab is selected
- **THEN** the new-script tab has no visible selected-style border or fill

#### Scenario: Script enable switches
- **WHEN** the manager displays a script's enabled state
- **THEN** it uses a named, keyboard-operable switch with thumb position and color distinguishing on from off
- **AND** saving disables the switch temporarily; a failed toggle restores the previous state and displays the error

#### Scenario: Toolbar badge
- **WHEN** the bridge is connected and the current HTTP(S) page's native discovery succeeds
- **THEN** its tab-specific toolbar badge shows the native tool count, including zero, capped visually at 99+ with the full count in its tooltip
- **WHEN** the bridge disconnects or pairing is missing
- **THEN** an exclamation badge takes priority and the tooltip explains the connection state; reconnect restores page counts
- **AND** loading and unsupported pages show no count, failed discovery shows a question mark and page tool errors show an exclamation mark
- **AND** navigation invalidates old counts and late inspection results cannot overwrite a newer state; activation and page tool changes refresh the badge without invoking tools

#### Scenario: Guided browser pairing
- **WHEN** a user opens connection settings
- **THEN** the main flow offers copying local setup instructions to their AI and pasting the complete returned connection code, without asking them to locate a token file or enter a port
- **AND** local builds include real executable and server paths without secrets, with MCP configuration and legacy port entry inside collapsed manual settings
- **WHEN** the user asks their AI to call connection_info
- **THEN** the MCP server starts its authenticated local relay before browser pairing and returns a private versioned connection code containing token and port, without invoking page tools
- **WHEN** the user pastes that code
- **THEN** both the UI and background validate it before saving, the code's port takes precedence, invalid input remains available to correct, and no connection success is shown until the socket connects
- **AND** clipboard denial exposes selectable instructions, while the connected state asks the AI to verify page discovery rather than claiming AI invocation has already passed


### Requirement: Developer public beta distribution
The project SHALL publish a prebuilt developer beta with truthful compatibility and data-flow documentation.

#### Scenario: Public beta installation
- **WHEN** a tester downloads the versioned prebuilt archive
- **THEN** it includes the simplified dinosaur-head brand assets, installation steps, privacy notice, license and feedback links, but no local pairing data, browser profiles or machine-specific build configuration
- **AND** the tester can load the unpacked extension without installing dependencies or building; the bundled MCP requires Node.js 22+; native WebMCP availability is a separate requirement from userScripts permission
- **AND** the extension icon and manager branding use the same simplified dinosaur head, while connection badges retain their existing meaning
- **AND** Codex isolation experiments and mocked UI tests are not advertised as general installation acceptance


#### Scenario: Portable connection setup and diagnosis
- **WHEN** a prebuilt extension has no machine-specific configuration
- **THEN** copying setup instructions remains available and explains how the AI obtains configuration from the local setup.mjs without installing project dependencies or overwriting other MCP services
- **AND** setup.mjs only prints validated local paths and does not start a relay or write client settings; after relocation it reports the new directory
- **WHEN** the user requests connection checks
- **THEN** the UI reports userScripts permission, local relay state and native page discovery separately, with recovery guidance, without invoking website tools or claiming that AI-side verification passed
- **AND** release acceptance unpacks the actual ZIP outside the source tree and validates its hashes, MCP pairing and CLI without node_modules; a mock extension response is labeled as a transport check
