# EmbraceSessionPartManager

Manages browser session part spans with lifecycle tracking, properties, and breadcrumbs.

## Core Features

- **Session Part Lifecycle**: Creates OpenTelemetry spans representing session parts
- **Properties**: Temporary (session-scoped) and permanent (persisted in localStorage) properties
- **Breadcrumbs**: Records user interactions as span events within the session part
