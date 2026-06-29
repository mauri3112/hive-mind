# Hive Mind

Hive Mind is a voice-driven diagramming workspace for Mermaid diagrams. Speak a change you want to make, review the generated suggestion, and accept it only when the Mermaid source validates.

The app is built for fast collaborative diagram sketching: it keeps the current diagram visible, streams transcript activity into a side rail, proposes versioned changes, and lets you export the result as `.mmd` or `.svg`.

## Features

- Voice-to-intent analysis from the browser's speech recognition API.
- Review-first workflow for diagram changes, with accept and reject controls.
- Mermaid preview and source view kept side by side.
- Syntax validation before suggestions can be applied.
- Session-aware stale revision handling so old suggestions do not overwrite newer diagram edits.
- Optional Cerebras-backed model client with a local heuristic fallback for development.
- Download support for Mermaid source and rendered SVG.

## Tech Stack

- React 19 and Vite 7 for the client.
- Express 5 for the local API server.
- TypeScript and Zod for shared contracts.
- Mermaid for diagram rendering.
- Vitest, Testing Library, and Supertest for tests.
- OpenAI-compatible client configured for Cerebras when `CEREBRAS_API_KEY` is present.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`.
- npm.
- A browser with Web Speech API support for dictation. Chrome and other Chromium-based browsers are the safest choice.

## Getting Started

Clone the repository and install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start the client and API server together:

```bash
npm run dev
```

Open the Vite URL shown in your terminal, usually `http://localhost:5173`.

The API server listens on `http://localhost:8787` by default, and Vite proxies `/api` requests to it.

## Model Configuration

Hive Mind runs without an API key by using the built-in heuristic model. That fallback recognizes a small set of demo intents, such as adding persistence, auth, rate-limit paths, retry loops, and state diagrams.

For model-backed suggestions, add a Cerebras API key to `.env`:

```bash
CEREBRAS_API_KEY=your_key_here
CEREBRAS_MODEL=gemma-4-31b
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
CEREBRAS_PROMPT_CACHE_KEY_ENABLED=false
PORT=8787
```

Useful debug flags:

```bash
HIVE_DEBUG=true
HIVE_DEBUG_MODEL_JSON=false
```

Never commit `.env`; it is ignored by git.

## Scripts

```bash
npm run dev          # Run Vite and the API server in watch mode
npm run dev:client   # Run only the Vite client
npm run dev:server   # Run only the Express API server
npm run build        # Type-check and build the client
npm run preview      # Preview the production build
npm test             # Run the test suite once
npm run test:watch   # Run tests in watch mode
```

## Project Structure

```text
src/        React app, hooks, UI components, and browser utilities
server/     Express API, model clients, prompt builders, and session state
shared/     Zod schemas and shared TypeScript types
tests/      API, unit, and UI tests
```

## API Overview

- `GET /api/health` reports server health and the active model client.
- `POST /api/hive/analyze` turns recent transcript text into a diagram intent.
- `POST /api/hive/propose` turns an intent into a pending Mermaid diagram suggestion.
- `POST /api/hive/apply` applies a pending suggestion to the current session document.

The shared request and response contracts live in `shared/hiveSchemas.ts`.

## Contributing

Contributions are welcome. Please keep changes focused, run the relevant tests, and prefer shared schema updates when API behavior changes.

Before opening a pull request:

```bash
npm test
npm run build
```

## License

MIT
