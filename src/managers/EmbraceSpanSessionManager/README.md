# EmbraceSpanSessionManager

Manages browser session spans with automatic lifecycle tracking, properties, breadcrumbs, and cross-tab relationships.

## Core Features

- **Session Lifecycle**: Creates OpenTelemetry spans representing user sessions
- **Auto-termination**: Ends sessions on inactivity, visibility changes, or timeouts  
- **Properties**: Temporary (session-scoped) and permanent (persisted) properties
- **Breadcrumbs**: Records user interactions as span events
- **Session Numbers**: Global counter persisted across all tabs and reloads
- **Cross-Tab Tracking**: Links tabs opened from other tabs

## Cross-Tab Tracking

Tracks parent-child relationships between tabs to understand user navigation flows.

### Key Concepts

- **Tab ID**: Unique identifier for each browser tab
- **Parent Tab ID**: ID of the tab that opened this tab (if any)
- **Experience ID**: Groups related tabs in the same browsing journey

### Implementation

1. **Storage Strategy**
   - Tab data stored in localStorage at URL-hashed keys (`emb_tab_{hash}`)
   - Current tab identity stored in sessionStorage (survives reloads)
   - Parent discovery via `document.referrer` matching

2. **Parent Detection**
   - Only checks same-origin referrers
   - 20-second window to find valid parents
   - Most recent tab at the referrer URL becomes parent

3. **Click Tracking**
   - Listens for clicks that open new tabs (middle-click, Ctrl+click, target="_blank")
   - Updates localStorage before navigation to ensure parent is findable

4. **Cleanup**
   - Removes tab data older than 30 minutes
   - Triggered on storage quota errors
   - Limits entries per URL to prevent unbounded growth

### Span Attributes

```
emb.tab_id         - This tab's unique ID
emb.parent_tab_id  - ID of tab that opened this one
emb.experience_id  - Shared across related tabs
```
