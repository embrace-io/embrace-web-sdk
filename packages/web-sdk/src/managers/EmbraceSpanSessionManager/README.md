# EmbraceSpanSessionManager

Manages browser session spans with lifecycle tracking, properties, and breadcrumbs.

## Core Features

- **Session Lifecycle**: Creates OpenTelemetry spans representing user sessions
- **Properties**: Temporary (session-scoped) and permanent (persisted in localStorage) properties
- **Breadcrumbs**: Records user interactions as span events within the session
- **Session Numbers**: Global counter persisted in localStorage across all tabs
- **Tab Tracking**: Assigns a unique tab ID persisted in sessionStorage
- **Navigation Source**: Detects how the user arrived (same-origin link, external, direct, reload, back/forward)

### Storage Strategy

- Tab ID stored in sessionStorage (persists through page reloads)
- Session number stored in localStorage under `embrace_session_number` key

### Span Attributes

```
emb.navigation_source   - How the user arrived at this page
emb.referrer_url        - Scrubbed referrer URL (if valid)
```
