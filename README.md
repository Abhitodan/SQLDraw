<div align="center">

# 🗺️ SQLDraw

### Visual SQL Procedure Intelligence — Parse, Execute, Understand

[![.NET](https://img.shields.io/badge/.NET_10-512BD4?style=flat&logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**SQLDraw** turns your SQL Server stored procedures into interactive control flow graphs, runs them in a safe sandbox, and lets you interrogate the results with an AI assistant — all in one tool.

</div>

---

## ✨ What It Does

Most SQL debugging means staring at walls of T-SQL and guessing which branch ran. SQLDraw makes it visual and interactive:

- **Parse any stored procedure** → instant interactive control flow graph
- **Execute safely** with rollback-by-default — zero risk to your data
- **See exactly what ran** — executed nodes light up, every statement is traced with row counts and timings
- **Ask your AI assistant** — chat with Claude, GPT, or Gemini about the procedure's logic, execution, or potential issues

---
<img width="2553" height="1291" alt="image" src="https://github.com/user-attachments/assets/06523e46-5492-438d-8e6d-07abf07b574d" />

<img width="2559" height="1274" alt="image" src="https://github.com/user-attachments/assets/a44b22f5-0628-48d6-9caf-122b5d37e18f" />

## 🖼️ Features at a Glance

| Feature | Description |
|---|---|
| 🔍 **CFG Visualizer** | Interactive React Flow graph — zoom, pan, click nodes, cluster mode |
| ⚡ **Safe Execution** | 4 run modes: Dry Run, SQLite Sandbox, Rollback (safe), Commit |
| 📊 **Execution Trace** | Step-by-step timeline with SQL text, row counts, result previews, durations |
| 🤖 **AI Chat** | Multi-provider AI assistant (Claude, GPT-4, Gemini) with full procedure context |
| 🎯 **Node Filtering** | Filter by node type, dim un-executed paths, cluster related nodes |
| 📥 **Live Fetch** | Connect to SQL Server and fetch proc definitions directly |
| 📋 **Sample Library** | Built-in procedures to explore without any database setup |

---

## 🏗️ Architecture

```
SQLDraw/
├── client/               # React 19 + TypeScript + Vite
│   └── src/
│       ├── components/
│       │   ├── ai/       # AI chat panel
│       │   ├── graph/    # ReactFlow CFG renderer + controls
│       │   ├── input/    # T-SQL input panel + parameter editor
│       │   └── trace/    # Execution trace timeline
│       ├── stores/       # App state (useReducer) + persistent config (Zustand)
│       └── api/          # Typed API client + SSE streaming
│
├── server/ProcSim/       # .NET 10 Web API
│   ├── Services/
│   │   └── AiChatService.cs   # Multi-provider streaming AI
│   ├── Models/           # Request / response contracts
│   └── wwwroot/          # Built frontend (generated)
│
└── samples/              # Schema, seed data, sample procedures
```

**Tech stack:**
- **Frontend**: React 19, TypeScript, Vite, Ant Design 5, ReactFlow, Framer Motion
- **Backend**: .NET 10, ASP.NET Core Minimal API, Microsoft.SqlServer.TransactSql.ScriptDom
- **AI**: Server-Sent Events streaming — Anthropic Claude, OpenAI GPT, Azure OpenAI, Google Gemini
- **Execution**: SQLite sandbox (no SQL Server needed) or live SQL Server with rollback

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version |
|---|---|
| [.NET SDK](https://dotnet.microsoft.com/download) | 10+ |
| [Node.js](https://nodejs.org/) | 18+ |
| SQL Server *(optional)* | Any — for live execution mode only |

### 1. Start the backend

```bash
cd server/ProcSim
dotnet run
```

Backend starts at `http://localhost:5219`.

### 2. Start the frontend

```bash
cd client
npm install
npm run dev
```

Frontend starts at `http://localhost:5173` with API proxy to the backend.

### 3. Open and explore

Navigate to `http://localhost:5173`, load a sample procedure from the dropdown, click **Parse**, and explore the graph. No database setup required.

### 4. Production build (single server)

```bash
cd client
npm run build          # Outputs to server/ProcSim/wwwroot/
cd ../server/ProcSim
dotnet run             # Serves frontend + API at :5219
```

---

## 🧪 Sample Database Setup

The built-in sample loader works out of the box. For live SQL Server execution against the provided samples:

```bash
sqlcmd -S localhost -d MyTestDB -i samples/schema.sql
sqlcmd -S localhost -d MyTestDB -i samples/seed.sql
sqlcmd -S localhost -d MyTestDB -i samples/procs.sql
```

**Need a quick SQL Server? Use Docker:**

```bash
docker run \
  -e "ACCEPT_EULA=Y" \
  -e "SA_PASSWORD=YourStr0ngP@ss!" \
  -p 1433:1433 \
  --name sqldev \
  -d mcr.microsoft.com/mssql/server:2022-latest
```

Connection string: `Server=localhost;Database=MyTestDB;User Id=sa;Password=YourStr0ngP@ss!;TrustServerCertificate=true`

---

## 🤖 AI Assistant Setup

SQLDraw supports four AI providers. Configure via the **⚙️ Settings** icon in the top bar → **AI** tab.

| Provider | Model Examples |
|---|---|
| **Anthropic Claude** | `claude-3-5-sonnet-20240620`, `claude-3-opus-20240229` |
| **OpenAI GPT** | `gpt-4o`, `gpt-4-turbo` |
| **Azure OpenAI** | Your deployment name |
| **Google Gemini** | `gemini-1.5-pro`, `gemini-1.5-flash` — *or click "Fetch Models" to load all available* |

> **Privacy note**: Your API key and procedure content are sent directly to the selected provider. Keys are stored in browser `localStorage` only and never sent to or persisted on the SQLDraw server.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/proc/parse` | Parse T-SQL → CFG nodes/edges + parameters |
| `POST` | `/api/proc/run` | Execute procedure → SSE trace event stream |
| `GET` | `/api/proc/run/{runId}` | Retrieve a previous run result |
| `GET` | `/api/proc/samples` | List built-in sample procedures |
| `POST` | `/api/ai/chat` | Stream AI response (SSE) |
| `POST` | `/api/ai/models` | Fetch available models for a provider (Gemini) |

---

## ✅ Supported T-SQL Constructs

```
✔ IF / ELSE                          ✔ BEGIN TRANSACTION / COMMIT / ROLLBACK
✔ WHILE                              ✔ SELECT / INSERT / UPDATE / DELETE / MERGE
✔ BEGIN TRY / BEGIN CATCH            ✔ EXEC (traced as call nodes)
✔ BEGIN / END blocks                 ✔ Dynamic SQL (sp_executesql / EXEC(@sql))
```

---

## 🛡️ Execution Safety

SQLDraw is built safety-first:

- **Rollback mode** (default) — every execution wraps in a transaction and rolls back. Zero data changes.
- **SQLite sandbox** — run dry against a best-effort SQLite interpreter. No SQL Server needed.
- **Dry run** — static CFG walk only, no SQL Server connection required.
- **System DB guard** — `master`, `msdb`, `model`, `tempdb` are refused as targets.
- **Statement timeout** — 30 seconds max per execution.
- **Result preview cap** — 50 rows per result set.

---

## 🧪 Running Tests

```bash
cd server/ProcSim.Tests
dotnet test
```

14 tests covering: CFG parser (IF/ELSE, WHILE, TRY/CATCH, transactions, parameters, EXEC), Mermaid generation, and connection string validation.

---

## ⚠️ Known Limitations

- Dynamic SQL text is captured at runtime but not mapped back to CFG nodes
- CURSOR constructs are not parsed into the CFG
- Nested procedure calls are traced as opaque `EXEC` nodes — no recursive CFG expansion
- Node-to-trace correlation uses normalized text matching (best-effort)

---

## 🗺️ Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features, known limitations, and design decisions.

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for the full security model, API key handling details, and responsible disclosure policy.

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `git commit -m 'feat: add my feature'`
4. Push and open a Pull Request

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
Built with ❤️ for SQL developers who deserve better tooling.
</div>
