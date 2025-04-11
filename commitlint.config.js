export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always', 100],
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
        'revert',
      ],
    ],
  },
  parserPreset: {
    parserOpts: {
      headerPattern: /^(?:EMBR-[0-9]+\s+)?(\w*)(?:\((.*)\))?: (.*)$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
};
