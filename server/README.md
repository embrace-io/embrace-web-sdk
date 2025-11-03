# Local debugging collector

This is a simple collector for local debugging and testing purposes. It listens on port 3000 for OTLP HTTP requests and logs the received data to the console.
It runs automatically when you run `npm run dev` in the root of the repository.

## Usage

To start the server, run:

```bash
npm run dev
```

And update your .env file to point to the local collector:

```
# demo/frontend/.env

VITE_DATA_URL=http://localhost:3000
```

## Integration tests

This server is also used in the integration tests to verify that logs and traces are being sent correctly.