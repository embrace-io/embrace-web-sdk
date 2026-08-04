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
4. If optional add its name to the `OptionalInstrumentations` union in `packages/web-sdk/src/sdk/types.ts`, and give it a key in `DefaultInstrumentationConfig` in the same file
5. Register in `packages/web-sdk/src/sdk/setupDefaultInstrumentations.ts` if auto-enabled
6. Catalog its timing frame (zero-time / time-origin / none) in `packages/web-sdk/src/utils/PerformanceManager/README.md`

Step 4 is not optional bookkeeping and it must come before step 5: `omit` is a `Set<OptionalInstrumentations>`, so registration code that tests membership for a name outside the union fails `tsc`, and the config lookup has no index signature to fall back on. Skipping it turns a missed registration into a type error rather than silent dead code, which is the good outcome, but only if you know where to look.

Only span/log emitters belong in `instrumentations/`. Detectors that emit no telemetry go in `utils/`.

## Adding a Processor

1. Create in `packages/web-sdk/src/processors/<Name>Processor/`
2. Implement `SpanProcessor` or `LogRecordProcessor`
3. Export from `packages/web-sdk/src/processors/index.ts`
4. Add it to the chain in `packages/web-sdk/src/sdk/initSDK.ts`: `finalSpanProcessors` inside the `setupTraces` helper, or `finalLogProcessors` inside `setupLogs`. Not in `initSDK` itself.

Position in those arrays can matter, so read the inline comments before inserting. A log processor that depends on another's stamp has to run after it (`SignalCorrelationLogRecordProcessor` must follow `UserSessionLogRecordProcessor`), while the span chain notes where placement is deliberately order-independent. Exporters and batch processors are appended after the array is built; leave that tail alone.
