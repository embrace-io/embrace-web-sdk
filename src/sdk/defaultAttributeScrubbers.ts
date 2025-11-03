import {
  ATTR_URL_FULL,
  ATTR_URL_PATH,
  ATTR_URL_QUERY,
  SEMATTRS_HTTP_URL,
} from '@opentelemetry/semantic-conventions';
import type { AttributeScrubber } from '../common/index.js';

const HOST_CREDENTIALS_REGEX = /\/\/(.+):(.+)@(.+)\//;

// https://github.com/open-telemetry/semantic-conventions/blob/3b64cb31022feaacb410bfd6e571c1f19b5fbce0/docs/registry/attributes/url.md?plain=1#L41
const DEFAULT_SENSITIVE_TOKENS = [
  'AWSAccessKeyId',
  'Signature',
  'sig',
  '`X-Goog-Signature',
  'password',
  'auth',
  'pw',
  'token',
];

type scrubArgs = {
  value: string;
  queryParamRegex: RegExp;
  scrubPath: boolean;
  scrubQuery: boolean;
};

const scrubURL = ({
  value,
  queryParamRegex,
  scrubPath,
  scrubQuery,
}: scrubArgs) => {
  let scrubbed = value;

  if (scrubPath) {
    // scrub credentials passed via URL in form of `https://username:password@www.example.com/`
    scrubbed = scrubbed.replace(
      HOST_CREDENTIALS_REGEX,
      '//REDACTED:REDACTED@$3/',
    );
  }

  if (scrubQuery) {
    // scrub query string parameters of the form "key=sensitiveValue"
    scrubbed = scrubbed.replaceAll(queryParamRegex, '$1$2=REDACTED');
  }

  return scrubbed;
};

export const getDefaultAttributeScrubbers = (
  additionalSensitiveQueryTokens?: string[],
): AttributeScrubber[] => {
  const sensitiveQueryTokens = [
    ...DEFAULT_SENSITIVE_TOKENS,
    ...(additionalSensitiveQueryTokens || []),
  ];

  const queryParamRegex = new RegExp(
    `(^|&|\\?)(${sensitiveQueryTokens.join('|')})=[^&]+`,
    'g',
  );

  return [
    {
      // https://github.com/open-telemetry/semantic-conventions/blob/3b64cb31022feaacb410bfd6e571c1f19b5fbce0/docs/registry/attributes/url.md?plain=1#L30
      key: ATTR_URL_FULL,
      scrub: (value: string) =>
        scrubURL({ value, queryParamRegex, scrubPath: true, scrubQuery: true }),
    },
    {
      // Adding to catch the deprecated attribute that was replaced by ATTR_URL_FULL
      key: SEMATTRS_HTTP_URL,
      scrub: (value: string) =>
        scrubURL({ value, queryParamRegex, scrubPath: true, scrubQuery: true }),
    },
    {
      // https://github.com/open-telemetry/semantic-conventions/blob/3b64cb31022feaacb410bfd6e571c1f19b5fbce0/docs/registry/attributes/url.md?plain=1#L57
      key: ATTR_URL_PATH,
      scrub: (value: string) =>
        scrubURL({
          value,
          queryParamRegex,
          scrubPath: true,
          scrubQuery: false,
        }),
    },
    {
      // https://github.com/open-telemetry/semantic-conventions/blob/3b64cb31022feaacb410bfd6e571c1f19b5fbce0/docs/registry/attributes/url.md?plain=1#L59
      key: ATTR_URL_QUERY,
      scrub: (value: string) =>
        scrubURL({
          value,
          queryParamRegex,
          scrubPath: false,
          scrubQuery: true,
        }),
    },

    // NOTE that url.original could contain sensitive information however this is intentionally not scrubbed as per the
    // semantic convention:
    // https://github.com/open-telemetry/semantic-conventions/blob/3b64cb31022feaacb410bfd6e571c1f19b5fbce0/docs/registry/attributes/url.md?plain=1#L54
  ];
};
