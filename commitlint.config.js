export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 150],
    'body-max-line-length': [0, 'always', 300],
    'type-enum': [
      2,
      'always',
      [
        'release',
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
        'breaking',
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
