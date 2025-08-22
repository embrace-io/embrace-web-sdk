# Running the demo

### To run the demo, run these commands

On one terminal, on the root of the repo run:

```bash
npm run sdk:compile:esm:watch
```

This allows you to work on the SDK and see the changes reflected in the demo app without needing to rebuild the SDK 
every time. On a different terminal, in the frontend-sdk directory, run the demo:

```bash
npm run setup
npm run build # It builds the internal SDK 
npm run dev # It listens to changes on the host SDK and rebuilds it
```

