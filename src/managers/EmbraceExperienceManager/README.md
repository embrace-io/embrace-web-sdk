# Embrace Experience Manager

## Overview

The Experience Manager is an **internal** component that assigns and tracks persistent experience IDs across browser tabs. It enables tracking of user journeys across multiple tabs, understanding how tabs are opened, and maintaining context about the user's navigation flow.

> **Architecture Note**: EmbraceExperienceManager is not exposed in the public API. It is automatically created and managed internally by EmbraceSpanSessionManager. Experience data is accessible through session span attributes.

## Key Features

**Important**: This is an internal component that is not exposed in the public API. It is automatically managed by EmbraceSpanSessionManager.

### Experience ID Management
- **Persistent IDs**: Each tab receives a single, immutable experience ID that persists throughout its lifetime
- **ID Inheritance**: Child tabs inherit experience IDs from parent tabs when opened via links or `window.open()`
- **Automatic Cleanup**: Experience data older than 24 hours is automatically removed to prevent storage bloat

### Tab Context Detection
The manager automatically detects how each tab was opened:
- `reload` - Page refresh
- `back_forward` - Browser navigation buttons
- `window_opener` - Opened via `window.open()`
- `same_origin_link` - Navigation from same-origin page
- `external_link` - Navigation from external domain
- `manual_new_tab` - User opened a new tab manually

### Referrer Tracking
- Identifies referrer type: `same_origin`, `external`, or `none`
- Captures referrer domain (for external) or path (for same-origin)
- Provides context about where users are coming from

## Architecture

### Storage Strategy
- **Session Storage**: Stores current tab's experience data (survives page refreshes)
- **Local Storage**: Stores inheritance data for cross-tab communication
- **Dual-key System**: Uses both tab ID and URL-based keys for accurate parent-child matching

### Inheritance Mechanism
1. Parent tabs store their experience data with:
   - Tab-specific key for direct lookup
   - URL-hash key for referrer-based matching
2. Child tabs check for inheritance by:
   - Matching document.referrer against stored URL hashes
   - Falling back to most recent inheritance entry if needed

### Performance Optimizations
- Pre-computed referrer information to avoid repeated URL parsing
- Efficient storage iteration with regex-based timestamp extraction
- Aggressive cleanup mode for quota management
- Single-pass storage scanning for inheritance lookup

## Usage

**Note**: EmbraceExperienceManager is an internal component that is automatically created and managed by EmbraceSpanSessionManager. It is not exposed in the public API.

### Internal Usage (within SDK)

```typescript
// Created automatically within EmbraceSpanSessionManager
private readonly _experienceManager: EmbraceExperienceManager;

constructor(args: EmbraceSpanSessionManagerArgs) {
  // ...
  this._experienceManager = new EmbraceExperienceManager();
  // ...
}

// Experience attributes are automatically added to session spans
const sessionAttributes = {
  ...this._experienceManager.getExperienceAttributes(),
  // other session attributes...
};
```

### Accessing Experience Data (Public API)

Users can access experience data through the session span attributes:

```typescript
import { session } from '@embrace-io/web-sdk';

const sessionManager = session.getSpanSessionManager();
const sessionSpan = sessionManager.getSessionSpan();

// Experience attributes are available on the session span
const attributes = sessionSpan?.attributes;
// Includes:
// - emb.experience_id: Experience ID shared across related tabs
// - emb.app_instance_id: Unique tab identifier  
// - emb.tab_open_method: How the tab was opened
// - emb.referrer_type: Type of referrer (same_origin/external/none)
// - emb.referrer_path: Path for same-origin referrers
// - emb.referrer_domain: Domain for external referrers
// - emb.previous_tab_id: Parent tab ID if inherited
```

## Data Flow

```
Tab Opens
    ↓
Detect Tab Context (open method + referrer)
    ↓
Check Existing Data (refresh/back)
    ├─ Yes → Preserve ID, Update Context
    └─ No → Check Inheritance
            ├─ Found → Use Inherited ID
            └─ Not Found → Generate New ID
    ↓
Store Experience Data
    ↓
Enable Inheritance for Child Tabs
```

## Storage Format

### Session Storage (Key: `embrace_experience`)
```json
{
  "experienceId": "uuid-v4",
  "lastActivityAt": 1234567890000,
  "tabOpenMethod": "same_origin_link",
  "referrerType": "same_origin",
  "previousTabId": "parent-tab-id"
}
```

### Local Storage (Inheritance)

#### Tab-specific key: `embrace_inheritance_[tabId]`
```json
{
  "experienceId": "uuid-v4",
  "sourceTabId": "tab-id",
  "timestamp": 1234567890000,
  "url": "https://example.com/page"
}
```

#### URL-based key: `embrace_inheritanceref_[urlHash]`
```json
{
  "experienceId": "uuid-v4",
  "sourceTabId": "tab-id",
  "timestamp": 1234567890000,
  "url": "https://example.com/page"
}
```

## Testing Considerations

When testing the Experience Manager:

1. **Multi-tab scenarios**: Test inheritance between parent and child tabs
2. **Navigation types**: Verify correct detection of all tab open methods
3. **Storage quota**: Test behavior when localStorage is full
4. **Cleanup**: Verify old data is removed after 24 hours
5. **Edge cases**: Test with disabled cookies, incognito mode, cross-origin scenarios

## Integration with OpenTelemetry

The Experience Manager integrates seamlessly with OpenTelemetry spans by automatically providing attributes to session spans via EmbraceSpanSessionManager. This enables:
- Tracking user journeys across tabs
- Understanding navigation patterns
- Analyzing referrer effectiveness
- Debugging multi-tab issues

### Attribute Names
- `emb.experience_id` - Experience ID shared across related tabs
- `emb.app_instance_id` - Unique identifier for each tab
- `emb.tab_open_method` - Method used to open the tab
- `emb.referrer_type` - Type of referrer (same_origin/external/none)
- `emb.referrer_path` - Path for same-origin navigation
- `emb.referrer_domain` - Domain for external referrers
- `emb.previous_tab_id` - ID of parent tab if inherited

## Browser Compatibility

- Requires modern browsers with support for:
  - Performance Navigation API
  - SessionStorage and LocalStorage
  - URL API
  - JSON parsing

## Security Considerations

- No sensitive data is stored in experience IDs
- URL hashing prevents direct URL exposure in storage keys
- Automatic cleanup prevents long-term data accumulation
- Cross-origin restrictions prevent unauthorized data access