# EmbraceSpanSessionManager

Manages browser session spans with lifecycle tracking, properties, breadcrumbs, and cross-tab relationships.

## Core Features

- **Session Lifecycle**: Creates OpenTelemetry spans representing user sessions
- **Properties**: Temporary (session-scoped) and permanent (persisted in localStorage) properties
- **Breadcrumbs**: Records user interactions as span events within the session
- **Session Numbers**: Global counter persisted in localStorage across all tabs
- **Cross-Tab Tracking**: Links tabs opened from other tabs using parent-child relationships

## Cross-Tab Tracking

Tracks parent-child relationships between tabs to understand user navigation flows.

### Key Concepts

- **Tab ID**: Unique identifier for each browser tab
- **Parent Tab ID**: ID of the tab that opened this tab (if any)
- **Experience ID**: Groups related tabs in the same browsing journey

### Implementation

1. **Storage Strategy**
   - Current tab identity stored in sessionStorage (persists through page reloads)
   - Tab activity data stored in localStorage under `embrace_tab_activity` key
   - Session number stored in localStorage under `embrace_session_number` key

2. **Parent Detection**
   - Checks `document.referrer` for same-origin URLs
   - Finds the most recently active tab within a short time window
   - Most recent tab becomes the parent

3. **Activity Tracking**
   - Records activity when tab becomes visible
   - Captures clicks that open new tabs (middle-click, Ctrl/Cmd+click, target="_blank")
   - Intercepts `window.open()` calls
   - Updates activity timestamp in localStorage


### Span Attributes

```
emb.tab_id         - This tab's unique ID
emb.parent_tab_id  - ID of tab that opened this one (if present)
emb.experience_id  - Shared across related tabs
```
