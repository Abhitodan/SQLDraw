# Security Policy

## Supported Versions

SQLDraw is a developer tooling project. Only the latest version on `main` is actively maintained.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately via GitHub's [Security Advisory](../../security/advisories/new) feature, or email the maintainer directly.

We aim to respond within 72 hours.

---

## Security Model

### What SQLDraw does

SQLDraw is a **local developer tool** — it is designed to run on your own machine or within your own infrastructure. It is not a SaaS product.

### API Key handling

- Your AI provider API keys (Anthropic, OpenAI, Azure, Gemini) are entered in the browser and stored in **browser `localStorage` only**.
- Keys are passed with each chat request from your browser → your local SQLDraw backend → the AI provider.
- **Keys are never logged, stored in a database, or persisted server-side.**
- Your SQLDraw backend is a local process — it does not transmit your keys anywhere other than the selected AI provider.

### SQL Server connection strings

- Connection strings are stored in **browser `localStorage` only** via the Settings panel.
- They are sent to the backend only when you explicitly trigger a Fetch or Execute operation.
- The backend uses them to open a connection and immediately discards them — they are never written to disk or logged.

### Execution safety

- **Rollback mode** wraps every execution in a transaction that is always rolled back. No data is changed.
- **System database guard** — `master`, `msdb`, `model`, and `tempdb` are refused as targets.
- **SQLite sandbox** — runs entirely in-memory with no SQL Server connection.
- **Statement timeout** — 30 seconds max per execution.

### What SQLDraw does NOT do

- No authentication or authorisation — do not expose the backend port publicly without a reverse proxy and auth layer.
- No rate limiting on AI endpoints — if you expose the server publicly, anyone who can reach it can use your backend as an AI proxy.
- No input sanitisation on T-SQL passed to the parser (it uses Microsoft's `TransactSql.ScriptDom` which is safe for parsing, but execution against a real SQL Server uses your credentials).

### Deployment guidance

SQLDraw is intended for **local use only**. If you must deploy it:

- Place it behind a reverse proxy (nginx, Caddy) with authentication (e.g. HTTP Basic Auth or OAuth2 proxy).
- Restrict the backend port to localhost or your internal network.
- Do not expose port 5219 directly to the internet.
