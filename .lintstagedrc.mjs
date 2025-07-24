export default {
  '{src,cli/src}/**/*': _stagedFiles => ['npm run sdk:lint:fix'],
};
