# Accounting Rules Engine – Foundation

This repository now includes a lightweight rules engine to centralize key accounting logic and make future policy changes safe and auditable.

Scope in this iteration:

- Database table `accounting_rules` with one-active-per-key semantics
- Engine module at `src/rules/engine.js` providing SQL snippets
- Routes wired to the engine: `accounts.js`, `funds.js`, `metrics.js`
- Verification script: `npm run verify:rules`

Principles:

- Single source of truth for balance math and revenue detection
- Non-breaking defaults baked into the engine when DB rules are absent
- Safe overrides via SQL templates with named placeholders

Rule keys implemented:

- `balance.delta` – SQL template for debit/credit delta. Default: `COALESCE({debit},0) - COALESCE({credit},0)`
- `revenue.predicate` – SQL predicate for detecting revenue lines. Default: `gl_codes.line_type = 'revenue' OR 4xxx fallback`

Placeholders supported:

- `{debit}` `{credit}` – numeric expressions for line debits/credits
- `{gl_code_a}` `{gl_code_j}` – account and line gl codes
- `{gc_line_type_a}` `{gc_line_type_j}` – `gl_codes.line_type` columns (when joined)

Verification:

- Run `npm run verify:rules` to print active rules and a metrics snapshot

Change management:

- To update behavior, insert a new active row per `rule_key` into `accounting_rules` and deactivate older rows
- All code paths will pick up changes within ~30 seconds (in-process cache TTL)
