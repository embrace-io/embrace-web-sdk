---
name: adding-sdk-components
description: Use when adding a new instrumentation or a new span/log processor to the Embrace Web SDK - covers the registration steps that are easy to miss, including the timing-frame catalog and the processor chain wiring.
---

# Adding SDK Components

Both walkthroughs below have registration steps that are easy to miss: a component that is created but not exported and wired will silently never run.

## Adding an Instrumentation

1. Create in `packages/web-sdk/src/instrumentations/<name>/`
2. Extend `EmbraceInstrumentationBase`
3. Export from `packages/web-sdk/src/instrumentations/index.ts`
4. Register in `sdk/setupDefaultInstrumentations.ts` if auto-enabled
5. Catalog its timing frame (zero-time / time-origin / none) in `packages/web-sdk/src/utils/PerformanceManager/README.md`

Only span/log emitters belong in `instrumentations/`. Detectors that emit no telemetry go in `utils/`.

## Adding a Processor

1. Create in `packages/web-sdk/src/processors/<Name>Processor/`
2. Implement `SpanProcessor` or `LogRecordProcessor`
3. Export from `packages/web-sdk/src/processors/index.ts`
4. Wire into processor chain in `initSDK.ts`
