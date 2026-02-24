# SQLDraw — Roadmap

This document tracks planned improvements, known limitations, and design decisions for SQLDraw.

---

## Planned

### Near-term
- [ ] Export CFG as PNG / SVG
- [ ] Dark mode
- [ ] Diff view — compare two procedure versions side-by-side
- [ ] CURSOR construct support in the CFG parser

### Medium-term
- [ ] Recursive CFG expansion for nested `EXEC` calls
- [ ] Share / permalink to a parse result (shareable URL)
- [ ] CI/CD integration — parse and validate stored procs in a pipeline

### Long-term
- [ ] Index advisor — suggest indexes based on CFG + trace analysis
- [ ] Execution plan overlay — attach `.sqlplan` XML to the trace view
- [ ] Multi-procedure dependency graph

---

## Known Limitations

- Dynamic SQL text is captured at runtime but not statically mapped back to CFG nodes
- `CURSOR` constructs are not parsed into the CFG (traced as opaque statements)
- Nested procedure calls are traced as opaque `EXEC` nodes — no recursive CFG expansion
- Node-to-trace correlation uses normalised text matching (best-effort, not guaranteed)
- SQLite sandbox is a best-effort T-SQL interpreter — complex SQL Server-specific constructs may not execute correctly

---

## Design Decisions

**Why a local backend instead of a pure browser app?**
T-SQL parsing uses Microsoft's `TransactSql.ScriptDom` which is a .NET library. Running it server-side also means AI API keys are only in transit — never in client-side bundle code.

**Why SQLite sandbox?**
Allows offline procedure exploration without any SQL Server setup. The sandbox normalises SQL Server syntax to SQLite equivalents for basic DML — useful for understanding logic, not for production validation.

**Why SSE instead of WebSockets for AI streaming?**
SSE is simpler, stateless, and works without any special infrastructure. Works through reverse proxies without configuration.
