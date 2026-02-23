<p align="center">
  <a href="https://embrace.io/?utm_source=github&utm_medium=logo" target="_blank">
    <picture>
      <source srcset="https://embrace.io/docs/images/embrace_logo_white-text_transparent-bg_400x200.svg" media="(prefers-color-scheme: dark)" />
      <source srcset="https://embrace.io/docs/images/embrace_logo_black-text_transparent-bg_400x200.svg" media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)" />
      <img src="https://embrace.io/docs/images/embrace_logo_black-text_transparent-bg_400x200.svg" alt="Embrace">
    </picture>
  </a>
</p>

[![codecov](https://codecov.io/gh/embrace-io/embrace-web-sdk/graph/badge.svg?token=88948NPGPI)](https://codecov.io/gh/embrace-io/embrace-web-sdk)
![GitHub Release Date](https://img.shields.io/github/release-date/embrace-io/embrace-web-sdk)
![GitHub commit activity](https://img.shields.io/github/commit-activity/t/embrace-io/embrace-web-sdk)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-orange)](./LICENSE)
![GitHub top language](https://img.shields.io/github/languages/top/embrace-io/embrace-web-sdk)
![Build and tests status](https://github.com/embrace-io/embrace-web-sdk/actions/workflows/ci-nodejs.yml/badge.svg)

# Embrace Real User Monitoring for Web

## About Embrace

[Embrace](https://embrace.io) is a user-focused observability platform for web and mobile apps, including kiosks, smart TVs and other platforms based on iOS or Android. Where traditional observability tools monitor backend infrastructure, Embrace captures full-fidelity performance and behavioral telemetry across user engagements with your app, at any scale. You see exactly what a user experienced and can correlate it with performance signals and traces from backend services.

## About the Embrace Web SDK

The Embrace Web SDK captures Spans and Logs from browser applications, enabling end-to-end distributed tracing by connecting client-side telemetry with backend traces via `traceparent` propagation. It provides rich out-of-the-box capture — auto-instrumented fetch/XHR, Web Vitals, click tracking, unhandled exceptions, and session management.

The SDK is built on [OpenTelemetry](https://opentelemetry.io). OTel is not a compatibility layer; it is the foundation. The SDK uses standard OTel APIs, processors, and exporters internally, which means:

- **Data portability.** Export to any OTel-compatible collector or backend, not just Embrace.
- **Instrumentation portability.** Standard OTel span and log APIs, so no conceptual rewrite if you migrate.
- **Extensibility.** Plug in existing OTel instrumentation packages or write your own.

Embrace engineers are among the maintainers of [opentelemetry-browser](https://github.com/open-telemetry/opentelemetry-browser), and actively contribute to OpenTelemetry SIGs across Browser, Swift/iOS, Android, and Kotlin.

## Packages

| Package | Description |
|---------|-------------|
| [`@embrace-io/web-sdk`](./packages/web-sdk/) | SDK for capturing web telemetry |
| [`@embrace-io/web-cli`](./packages/web-cli/) | CLI for sourcemap uploads and build-time tasks |

## Documentation

- [Get Started with the Embrace Web SDK](https://embrace.io/docs/web/getting-started/)
- [SDK README](./packages/web-sdk/README.md)

## Links

- [Embrace Dashboard](https://dash.embrace.io)
- [Embrace Community Slack](https://community.embrace.io/)
- [OpenTelemetry](https://opentelemetry.io)

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Local development setup](./DEVELOPING.md)
