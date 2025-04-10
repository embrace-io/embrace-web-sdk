import rules from '@commitlint/rules';

const removeEMBRNumberHeader = rule => (parsed, _when, _value) => {
  // remove EMBR-<number> from the header. We use it to link to internal Notion tickets
  parsed.header = parsed.header.replace(/(EMBR-[0-9]+\s+)/, '');
  return rule(parsed, _when, _value);
};

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'type-enum': [
      2,
      'always',
      [
        'deploy',
        'build',
        'ci',
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'chore',
        'revert'
      ]
    ]
  },
  plugins: [
    {
      rules: {
        'type-enum': removeEMBRNumberHeader(rules['type-enum']),
        'subject-empty': removeEMBRNumberHeader(rules['type-enum']),
        'type-empty': removeEMBRNumberHeader(rules['type-enum'])
      }
    }
  ]
};
