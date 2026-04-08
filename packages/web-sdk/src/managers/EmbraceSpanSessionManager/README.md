# EmbraceSpanSessionManager

Manages browser session spans with lifecycle tracking, properties, and breadcrumbs.

## Core Features

- **Session Lifecycle**: Creates OpenTelemetry spans representing user sessions
- **Properties**: Temporary (session-scoped) and permanent (persisted in localStorage) properties
- **Breadcrumbs**: Records user interactions as span events within the session
- **Session Numbers**: Global counter persisted in localStorage across all tabs

### Storage Strategy

- Tab ID stored in sessionStorage (persists through page reloads)
- Session number stored in localStorage under `embrace_session_number` key
