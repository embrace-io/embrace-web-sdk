# OpenTelemetry Latest Compatibility Test

This test bundle validates compatibility between the Embrace Web SDK and the latest versions of OpenTelemetry packages. It serves as an early warning system for breaking changes in upstream OTel dependencies.

## 🎯 Purpose

The Embrace Web SDK is built on OpenTelemetry and maintains compatibility with specific versions of OTel packages. This test:

- **Validates compatibility** with the latest OTel packages (`@latest`)
- **Identifies breaking changes** before they affect production
- **Documents known incompatibilities** and their root causes
- **Provides a development environment** for testing fixes

## 📦 Current Dependencies

This test uses the latest versions of:

- `@opentelemetry/context-zone`
- `@opentelemetry/instrumentation`
- `@opentelemetry/instrumentation-document-load`
- `@opentelemetry/sdk-logs`
- `@opentelemetry/sdk-trace-web`

Compare with the SDK's [supported versions](../../../README.md#compatibility-with-otel-packages):

| Package Category | SDK Compatible | Test Uses |
|------------------|----------------|-----------|
| OTel APIs | ^1.9.0 | latest |
| Core | ^1.30 | latest |
| Instrumentations | ^0.57.0 | latest |

## 🚨 Known Issues

### 1. TypeScript Compilation Errors

The build fails due to TypeScript incompatibilities between the SDK's pinned OTel versions and the latest packages.

### 2. Runtime Errors

When running in development mode, two critical errors occur:

#### Duplicate API Registration
```
Error: @opentelemetry/api: Attempted duplicate registration of API: trace
    at registerGlobal (global-utils.ts:47:17)
    at TraceAPI2.setGlobalTracerProvider (trace.ts:67:21)
    at WebTracerProvider.register (chunk-VACF7UEC.js?v=0ab27dbd:152:11)
```

**Root Cause**: Multiple versions of `@opentelemetry/api` are loaded, causing conflicts in the global registry.

#### API Incompatibility
```
embrace-sdk failed to initialize the SDK: loggerProvider.addLogRecordProcessor is not a function
```

**Root Cause**: Breaking changes in the logging API between SDK-compatible versions and latest versions.

---

**Note**: This is a test environment for compatibility validation. Do not use these latest package versions in production until compatibility is verified and the main SDK is updated accordingly.
