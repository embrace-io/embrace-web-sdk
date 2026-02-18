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

# Embrace Web SDK

Observability SDK for web applications built on [OpenTelemetry](https://opentelemetry.io). Captures Spans and Logs to help debug and monitor user experiences.

## Packages

| Package | Description |
|---------|-------------|
| [`@embrace-io/web-sdk`](./packages/web-sdk/) | SDK for capturing web telemetry |
| [`@embrace-io/web-cli`](./packages/web-cli/) | CLI for sourcemap uploads and build-time tasks |

## Documentation

- [SDK usage, API reference, and integration guides](./packages/web-sdk/README.md)
- [Web Documentation](https://embrace.io/docs/web/getting-started/)

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Development setup](./DEVELOPING.md)
