---
name: testing-pipeline
description: One-command full testing system with auto-fix loop. Spawns 7 QA agents to scan, auto-fixes safe issues via coder agents, re-scans to verify — up to 3 iterations. Produces a unified QA report with PASS/FAIL verdict.
version: 3.0.0
---

# Testing Pipeline v3.0 — Scan, Fix, Verify Loop

You are the orchestrator for MediMind's comprehensive testing pipeline. When invoked with `/testing-pipeline <area>`, you:
1. **Scan** — spawn 7 QA agents to find issues
2. **Triage** — classify each finding as auto-fixable or manual-review
3. **Fix** — spawn coder agents to apply safe fixes (one agent per file)
4. **Verify** — re-run only the agents that had failures
5. **Loop** — repeat triage/fix/verify up to 3 iterations until clean

**Analogy:** Like a car inspection where 7 mechanics check different systems, a repair crew fixes what they can on the spot, and the mechanics re-check — all before handing you the final report.

## Usage

```
/testing-pipeline <area>
```

**Examples:**
- `/testing-pipeline warehouse` — tests all warehouse-related code
- `/testing-pipeline registration` — tests patient registration
- `/testing-pipeline laboratory` — tests lab module
- `/testing-pipeline financial` — tests financial module
- `/testing-pipeline patient-history` — tests patient history

---

## Step 0: Resume Check

Before doing anything, check if a previous run was interrupted:

```bash
cat qa-reports/.pipeline-state.json 2>/dev/null
```

**If the file exists**, read it and decide:
- If the file is not valid JSON, delete it and start fresh
- If the file's `branch` field doesn't match the current git branch, delete it and start fresh (code may have changed)
- **Same area + phase is NOT "done"** → Resume from the saved phase (skip to that step)
- **Different area OR phase is "done"** → Delete it and start fresh

**If the file doesn't exist** → Start fresh from Step 1.

On resume, always re-check the dev server and Playwright (Step 2 health checks) before continuing.

---

## Step 1: Resolve Target Area

Use a **two-tier search** to find all related code, not just directories that share the area name.

### Tier 1: Direct Match

Glob for directories under `packages/app/src/emr/` matching the area prefix:

```
components/<area>*/
services/<area>*/
hooks/<area>*/
views/<area>*/
types/<area>*
translations/<area>*/
```

### Tier 2: Known Related Directories

Some areas have code spread across multiple directory names. Check this mapping and add any extra directories:

```
AREA_MAPPINGS:
  warehouse → components/warehouse, services/warehouse, hooks/warehouse,
              services/administration, views/settings/tabs/administration,
              components/selling, components/writeoff, components/returns,
              components/procurement, components/order, types/warehouse*,
              translations/warehouse
  financial → components/financial, services/financial, hooks/financial,
              components/billing, services/billing, types/financial*,
              translations/financial
  laboratory → components/laboratory, services/laboratory, hooks/laboratory,
               components/lab-*, services/lab-*, types/laboratory*,
               translations/laboratory
```

If the area is not in the mapping, just use Tier 1 results.

Build a comma-separated list of ALL matching directories (both tiers). This is the `TARGET_DIRS` that every agent will scan.

## Step 2: Set Up Environment

### Clean Stale Artifacts
```bash
rm -rf qa-reports/.parts
rm -rf qa-reports/.fix-logs
```

### Start Dev Server
```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null; cd packages/app && npx vite --port 3000 &
```

**Health check** — wait up to 30 seconds for the dev server to respond:
```bash
for i in $(seq 1 15); do curl -s -o /dev/null http://localhost:3000 && break || sleep 2; done
```

### Start Playwright Server
```bash
pkill -9 -f Chromium 2>/dev/null; pkill -9 -f playwright 2>/dev/null
rm -f /tmp/playwright-*.json /tmp/playwright-*.pid
npx tsx scripts/playwright/server.ts &
sleep 3
```

**Readiness check** — verify Playwright is accepting commands:
```bash
npx tsx scripts/playwright/cmd.ts url
```

If this command fails, wait 3 more seconds and retry once.

### Create Output Directories
```bash
mkdir -p qa-reports/.parts
mkdir -p qa-reports/.fix-logs
```

### Write Initial State File

Write the pipeline state so we can resume if interrupted:

```bash
# Write to qa-reports/.pipeline-state.json
```

```jsonc
{
  "version": 2,
  "area": "{area}",
  "branch": "{current git branch}",
  "startedAt": "{ISO timestamp}",
  "targetDirs": "{TARGET_DIRS}",
  "iteration": 1,
  "phase": "scan",
  "failedAgents": [],
  "findings": [],
  "fixBatches": []
}
```

Use the Write tool to create `qa-reports/.pipeline-state.json` with the JSON above, replacing `{area}`, `{current git branch}`, `{ISO timestamp}`, and `{TARGET_DIRS}` with actual values.

For ALL subsequent "Update state file" instructions: Use the Read tool to read the current state file, modify the relevant fields, then use the Write tool to save the updated JSON.

---

## Step 3: Spawn Agents in Two Waves (SCAN Phase)

**CRITICAL:** The E2E Browser (02) and UI/UX (06) agents both use the Playwright browser. They share a single browser page and command file, so they CANNOT run at the same time — they'd overwrite each other's commands.

**Wave 1 (5 agents in parallel):** Launch agents 01, 03, 04, 05, 07 simultaneously.
**Wave 2 (sequential):** After Wave 1 completes, launch agent 02 (E2E Browser). After it finishes, launch agent 06 (UI/UX).

Each agent writes to `qa-reports/.parts/0N-name.md`.

**On resume:** If resuming the scan phase, check which `.parts/` files already exist and are non-empty. Only re-run agents whose output files are missing or empty.

**CRITICAL:** Pass the following context to EVERY agent in their prompt:

### Shared Context Block (copy into each agent prompt)

```
TARGET AREA: {area}
TARGET DIRECTORIES: {TARGET_DIRS}
DATE: {YYYY-MM-DD}
BRANCH: {current git branch}

TEST CREDENTIALS:

EMR Staff Portal:
- URL: http://localhost:3000
- Email: admin@medimind.ge
- Password: MediMind2024

Patient Portal:
- URL: http://localhost:3000/portal
- Email: einelasha@gmail.com
- Password: Dba545c5fde36242@@

Medplum Cloud API:
- API URL: https://api.medplum.com/
- Project ID: 71c7841a-7f47-4029-8ab4-0bf62751c173
- Client ID: c7d601b8-758f-4c90-b4dd-2fe8e1d66973

Supabase:
- URL: https://kvsqtolsjggpyvdtdpss.supabase.co

PLAYWRIGHT COMMANDS:
npx tsx scripts/playwright/cmd.ts navigate "url"
npx tsx scripts/playwright/cmd.ts fill "selector" "value"
npx tsx scripts/playwright/cmd.ts click "selector"
npx tsx scripts/playwright/cmd.ts screenshot "name"
npx tsx scripts/playwright/cmd.ts wait 2000
npx tsx scripts/playwright/cmd.ts waitfor "selector"
npx tsx scripts/playwright/cmd.ts text "selector"
npx tsx scripts/playwright/cmd.ts evaluate "script"
npx tsx scripts/playwright/cmd.ts viewport 375 812
npx tsx scripts/playwright/cmd.ts select "selector" "value"
npx tsx scripts/playwright/cmd.ts press "key"
npx tsx scripts/playwright/cmd.ts count "selector"
npx tsx scripts/playwright/cmd.ts exists "selector"
npx tsx scripts/playwright/cmd.ts html "selector"
npx tsx scripts/playwright/cmd.ts clear "selector"
npx tsx scripts/playwright/cmd.ts selectOption "selector" "value"

CRITICAL FOR E2E AGENT (02): You MUST perform actual operations (create, edit,
delete, confirm) — not just load pages and take screenshots. Read component files
first to discover form fields and button selectors. If you can't perform an
operation, report it as a FAIL finding. Page-load-only testing is NOT acceptable.

VERDICT FORMAT: Write your actual verdict on the Verdict line like this:
  ## Verdict: PASS
  ## Verdict: FAIL
  ## Verdict: WARNING
Do NOT write "## Verdict: PASS / FAIL / WARNING" — pick ONE value.

EMPTY AREA: If you find zero matching files for the target area, write:
  ## Verdict: PASS
  No issues found — target area has no matching files for this check.

SCOPE: Only analyze files within TARGET_DIRS. Do NOT scan the entire codebase.
```

### Wave 1: Static Analysis + Unit Tests (5 agents in parallel)

| # | Agent | subagent_type | Output File |
|---|-------|---------------|-------------|
| 01 | Unit Tests | qa-unit-test-runner | `qa-reports/.parts/01-unit-tests.md` |
| 03 | Edge Cases | qa-edge-case-analyzer | `qa-reports/.parts/03-edge-cases.md` |
| 04 | FHIR Compliance | qa-fhir-validator | `qa-reports/.parts/04-fhir-compliance.md` |
| 05 | Security | qa-security-scanner | `qa-reports/.parts/05-security.md` |
| 07 | i18n & Quality | qa-i18n-quality | `qa-reports/.parts/07-i18n-quality.md` |

### Wave 2: Browser Agents (sequential — share single Playwright instance)

After Wave 1 completes:

1. **First:** Launch agent 02 (E2E Browser) and wait for it to finish.
2. **Then:** Launch agent 06 (UI/UX) and wait for it to finish.

| # | Agent | subagent_type | Output File |
|---|-------|---------------|-------------|
| 02 | E2E Browser | qa-e2e-browser-tester | `qa-reports/.parts/02-e2e-browser.md` |
| 06 | UI/UX | qa-ui-ux-tester | `qa-reports/.parts/06-ui-ux.md` |

### Example prompt for each agent:

```
You are the [Agent Name] agent for the MediMind testing pipeline.

[Shared Context Block]

YOUR OUTPUT FILE: qa-reports/.parts/0N-name.md

[Agent-specific instructions from their .md file]

Write your complete findings to YOUR OUTPUT FILE when done.
```

## Step 4: Verify Agent Output

Wait for all 7 Task tool calls to return.

**After all agents complete**, verify each output file:
1. Check that each `.parts/0N-*.md` file exists and is non-empty
2. Verify each file contains a `## Verdict:` line
3. If an output file is missing or empty, create a stub with:
   ```
   ## Verdict: FAIL
   **Reason:** AGENT DID NOT COMPLETE — no output file produced.
   ```
4. **For the E2E report (02), additionally check:**
   - Report must contain an `## Operation Coverage` table
   - At least 1 "Create" operation must show Attempted > 0
   - If the Operation Coverage table is missing or all Create/Edit/Delete show 0, override the E2E verdict to WARNING with note: "E2E tests were page-load-only — no operations were actually performed"

Update state file: `"phase": "triage"`

## Step 5: Early-Exit Check

Read each agent's verdict. If **ALL 7 agents report PASS**, the code is clean:

1. Update state file: set `phase` to `"done"`, `findings` to `[]`, `fixBatches` to `[]`
2. Skip Steps 6, 7, 8, 9 entirely — go directly to **Step 10** (Final Report + Cleanup)
3. Do NOT execute any triage, fix, or verify logic
4. The report will show "Iterations: 0 of 3 | Auto-fixes Applied: 0"

This saves time and cost — no need to triage, fix, or verify when everything passes.

---

## Quality Gates

Quality gates are checked during the final report (Step 10) and displayed as a separate table. They don't change the PASS/FAIL verdict but provide visibility into overall health.

| Gate | Threshold | Source |
|------|-----------|--------|
| Test Coverage (Statements) | >= 60% | Agent 01 report |
| Test Coverage (Branches) | >= 60% | Agent 01 report |
| Zero CRITICAL findings | 0 CRITICAL across all agents | All reports |
| Translation completeness (ka) | >= 95% of keys used in target area | Agent 07 report |
| E2E Operation Coverage | >= 1 Create + 1 Edit + 1 Status Change attempted | Agent 02 report |

When building the final report (Step 10), extract these metrics and add a **Quality Gates** section after the Executive Dashboard:

```markdown
## Quality Gates
| Gate | Threshold | Actual | Status |
|------|-----------|--------|--------|
| Statement Coverage | >= 60% | N% | PASS/FAIL |
| Branch Coverage | >= 60% | N% | PASS/FAIL |
| Zero CRITICAL Findings | 0 | N | PASS/FAIL |
| Georgian Translation | >= 95% | N% | PASS/FAIL |
| E2E Operation Coverage | >= 1 Create + 1 Edit + 1 Status Change | N Create, N Edit, N Status | PASS/FAIL |
```

---

## Step 6: Triage (Classify Findings)

**If this is iteration 2 or 3 (not the first triage):**
1. Clear ALL previous findings from state file: set `findings` to `[]`
2. Extract FRESH findings from the NEW `.parts/` reports only
3. Assign new IDs starting from `f-001`
4. Previous iteration findings are already reflected in the fix logs

Read the `.parts/` reports from agents that did NOT pass. For each `#### FINDING:` block in those reports, extract:

- **agent**: Which agent found it (e.g., "04")
- **category**: The finding code (e.g., "FC1", "SEC3", "I18N2")
- **severity**: CRITICAL / HIGH / MEDIUM / LOW
- **file**: Full file path
- **line**: Line number (if available)
- **title**: Short description
- **description**: Full explanation
- **suggestedFix**: What the agent suggests (if any)

Assign each finding an ID (`f-001`, `f-002`, etc.) and classify as **auto-fixable** or **manual-review** using these rules:

### Auto-Fixable Findings

| Agent | Category Code | Fix Action |
|-------|--------------|------------|
| 04 FHIR | FC1 | Replace hardcoded URL string with constant from `fhir-systems.ts` |
| 04 FHIR | FC5 | Move search prefix to value string |
| 04 FHIR | FC6 | Use `IDENTIFIER_SYSTEMS.*` constant |
| 04 FHIR | FC8 | Change to `valueDate` or `valueDateTime` |
| 07 i18n | I18N1 | Add missing key to `ka.json`/`ru.json` with English as placeholder |
| 07 i18n | I18N2 | Wrap hardcoded string with `t('key')` and add to translation files |
| 07 i18n | I18N3 | Remove `console.log` line |
| 07 i18n | I18N4 | Remove unused import line |
| 07 i18n | I18N5 | Remove commented-out/dead code block |
| 06 UI/UX | UI1 | Replace forbidden hex with `var(--emr-*)` per CLAUDE.md theme mapping |
| 06 UI/UX | UI2 | Replace hardcoded px font size with `var(--emr-font-*)` |
| 06 UI/UX | UI3 | Replace `--emr-gray-N` background with semantic `var(--emr-bg-*)` |
| 03 Edge | EC1 (LOW/MEDIUM only) | Add `?.` operator |
| 03 Edge | EC5 (LOW only) | Add `?.[0]` fallback |
| 03 Edge | EC9 (LOW only) | Add cleanup return to `useEffect` (e.g., `removeEventListener`, `clearInterval`) |
| 04 FHIR | FC10 (LOW only) | Add `_count: '100'` to unbounded `searchResources()` call |
| 05 Security | SEC11 (MEDIUM/LOW) | Replace `error.message` in notification with `t('genericError')` |
| 07 i18n | I18N6 | Replace hardcoded date format string with `toLocaleDateString()` call |
| 07 i18n | I18N7 | Replace template literal currency with `Intl.NumberFormat` |
| 07 i18n | I18N8 | Wrap hardcoded error string in notification with `t('key')` |
| 07 i18n | I18N9 | Add `_count: '100'` to unbounded `searchResources()` call |

### Manual-Review Findings (NOT auto-fixed)

| Agent | Category / Pattern | Why Manual |
|-------|-------------------|-----------|
| 01 Unit | Failed tests | Could be real bug vs outdated test — needs judgment |
| 01 Unit | Missing test files | Writing new tests requires understanding intent |
| 02 E2E | Broken journeys | Root cause unclear from screenshot alone |
| 03 Edge | CRITICAL severity | Data corruption risk — human must verify |
| 03 Edge | Async/concurrency issues | Wrong fix could introduce new bugs |
| 04 FHIR | FC3: Missing reference fields | Needs to know what reference should point to |
| 04 FHIR | FC4: Missing required fields | Could break other code that reads the resource |
| 05 Security | ALL findings (SEC1-SEC7) | Security fixes need human review |
| 06 UI/UX | Layout broken at viewport | Needs visual/design judgment |
| 01 Unit | UT4: Low coverage threshold | Writing new tests requires understanding intent |
| 01 Unit | UT5: Placeholder tests | Filling tests requires understanding requirements |
| 02 E2E | E2E4: Missing permission gate | Requires understanding intended access model |
| 02 E2E | E2E5: Deep link failure | Root cause could be routing, state, or auth |
| 03 Edge | EC7: Floating-point precision | Wrong fix could change financial calculations |
| 03 Edge | EC8: Georgian encoding | Needs understanding of full data flow |
| 03 Edge | EC9 (HIGH/CRITICAL) | Memory leak in critical path needs careful refactor |
| 03 Edge | EC10: Pagination truncation | Fix depends on paginate vs increase count vs change UI |
| 04 FHIR | FC9: Bundle validation | Missing bundle fields could break transactions |
| 04 FHIR | FC10 (HIGH/CRITICAL) | Pagination in analytics needs architectural decision |
| 04 FHIR | FC11: Reference target type | Wrong type could corrupt data relationships |
| 05 Security | SEC8: Query string PII | Needs redesign of URL parameter strategy |
| 05 Security | SEC9: Frontend-only validation | Needs backend StructureDefinition or Bot |
| 05 Security | SEC10: Audit logging gaps | Requires adding audit calls — needs judgment |
| 05 Security | SEC11 (HIGH/CRITICAL) | Error leakage in critical path needs review |
| 06 UI/UX | UI6-UI9 (all) | Layout/accessibility changes need design input |

Write all findings to the state file with their classification and `"status": "pending"`.

Record which agents had non-PASS verdicts in `failedAgents` (e.g., `["04", "07"]`).

If there are **zero auto-fixable findings**:
1. Set `phase` to `"done"` in state file
2. Skip Steps 7, 8, 9 entirely — go directly to **Step 10** (Final Report)
3. All findings will appear in the "Remaining Issues (Manual Review Required)" section

Otherwise, update state file: `"phase": "fix"`

---

## Step 7: Dispatch Fixes

### ON RESUME (if state file shows phase="fix")

If resuming into this step:
1. Read the `qa-reports/.fix-logs/` directory
2. For each batch in `fixBatches`:
   - If `qa-reports/.fix-logs/b-{batchId}.md` exists → skip (already done)
   - If not → add to pending dispatch queue
3. Dispatch only pending batches (do not re-run completed ones)

### Grouping Rule: One coder agent per file

Group all auto-fixable findings by their target file. Each file gets exactly one coder agent — this prevents two agents editing the same file at the same time.

**Special case — Translation files:** ALL missing-key findings (across all source files) get ONE dedicated coder agent that edits `ka.json` and `ru.json` together.

### Dispatch Order (CRITICAL — prevents file collisions)

1. **First wave:** All source file coders (max 5 parallel) — these edit `.ts`/`.tsx`/`.css` files only
2. **Second wave (AFTER all source file coders complete):** Translation coder — edits `ka.json`/`ru.json`

Source file coders must NOT edit translation files. If a finding requires both a source file change (wrapping with `t()`) AND a translation key addition, split it: source file coder handles the `t()` wrap, translation coder handles the key addition.

### Parallelism Rules

- Max **5 coder agents** running simultaneously (in each wave)
- If more than 5 files need fixing, process in sub-waves of 5
- Max **10 findings per coder agent** (take highest severity first; the rest go to next iteration)

### Coder Agent Prompt Template

For each batch, spawn a `coder` subagent with this prompt:

```
You are a fix agent for the MediMind testing pipeline. Apply ONLY the specific fixes listed below — nothing else.

TARGET FILE: {full file path}

FINDINGS TO FIX:
{For each finding in this batch:}
- [{id}] Line {line}: {title}
  Description: {description}
  Suggested Fix: {suggestedFix}

PROJECT CONVENTIONS:
- FHIR constants: packages/app/src/emr/constants/fhir-systems.ts
- Theme CSS variables: packages/app/src/emr/styles/theme.css
- Translation files: packages/app/src/emr/translations/ka.json, ru.json, en.json
- Theme color constants: packages/app/src/emr/constants/theme-colors.ts

RULES:
1. Read the target file FIRST before making any edits
2. Make minimal, surgical edits — only change what each finding describes
3. If a fix is unclear or risky, SKIP it and note why in your fix log
4. Do NOT refactor surrounding code, add comments, or "improve" anything
5. Do NOT fix issues not listed above
6. Use the Read tool to read files, the Edit tool to make changes
7. When replacing a hardcoded value with a constant:
   - Check if the import already exists at the top of the file
   - If not, add the import on a new line after existing imports
   - Import path: use relative path from the target file to the constants file
8. For translation JSON files (ka.json, ru.json):
   - Preserve existing indentation (2-space or 4-space, match the file)
   - Add keys in the correct nested structure (e.g., warehouse.stockMove.title)
   - Validate JSON is still valid after your edits
   - Do NOT reformat or re-sort existing keys

WHEN DONE: Write a fix log to qa-reports/.fix-logs/b-{batchId}.md with this format:

# Fix Log: Batch {batchId}
## File: {file path}

| Finding | Status | What Changed |
|---------|--------|-------------|
| {id} | fixed / skipped | Brief description |

## Notes
[Any issues encountered, skipped fixes with reasons]
```

### After Each Wave

After each wave of coder agents completes:
1. Read all fix logs from `qa-reports/.fix-logs/`
2. If a coder agent returned but its fix log file is missing:
   - Mark all findings in that batch as `"skipped"` with reason `"agent did not produce fix log"`
   - These findings will be retried in the next iteration
3. Update each finding's status in the state file (`"fixed"`, `"skipped"`)
4. Continue with next wave if more files remain

Update state file: `"phase": "verify"`

---

## Step 8: Verify (Targeted Rescan)

Re-run ONLY the agents that reported failures in the scan phase. This is faster than re-running all 7.

### Steps:

1. Delete the `.parts/` files for failed agents only:
   ```bash
   rm qa-reports/.parts/04-fhir-compliance.md  # example — only delete failed ones
   ```

2. Re-spawn those agents with the same shared context block and same target directories.

   **DISPATCH ORDER for re-scan:**
   1. First: Run Wave 1 agents in parallel (any of 01, 03, 04, 05, 07 that need re-running)
   2. Wait for ALL Wave 1 agents to complete
   3. Then: If agent 02 needs re-running, run it and wait for completion
   4. Then: If agent 06 needs re-running, run it and wait for completion

   Agents 02 and 06 share the Playwright browser and CANNOT run simultaneously.

3. Wait for agents to complete. Read new verdicts.

Update state file with new verdicts.

---

## Step 9: Loop Decision

Check the results of the verify phase:

### All agents PASS?
- Set `"phase": "done"` in state file
- Proceed to Step 10 (Final Report)

### Some agents still FAIL and iteration < 3?
- Increment `"iteration"` in state file
- Set `"phase": "triage"`
- Go back to **Step 6** (Triage) — re-read the new `.parts/` reports, extract new findings, classify, and fix again

### Iteration = 3 (max reached)?
- Move all findings still in `"pending"` status to `"manual"` status
- These appear in the "Remaining Issues (Manual Review Required)" section
- Set `"phase": "done"` in state file
- Proceed to Step 10

---

## Step 10: Final Report + Cleanup

### Build Unified Report

Read ALL files from `qa-reports/.parts/` and merge into one unified report.

#### Verdict Logic

1. Read each agent's report and extract their individual verdict (PASS/FAIL/WARNING)
2. Calculate overall verdict:
   - **FAIL** — Any agent has verdict FAIL (blocks deploy)
   - **PASS WITH WARNINGS** — No FAIL verdicts but at least one WARNING
   - **PASS** — All 7 agents report PASS

#### Report Format

Write the merged report to: `qa-reports/{area}-qa-{YYYY-MM-DD}.md`

```markdown
# QA Report: {Area} — Full Testing Pipeline
**Date:** YYYY-MM-DD | **Branch:** main | **Pipeline Version:** 3.0
**Iterations:** {N} of 3 | **Auto-fixes Applied:** {count}

## Overall Verdict: PASS / PASS WITH WARNINGS / FAIL

## Executive Dashboard
| # | Agent | Pass | Fail | Warning | Verdict |
|---|-------|------|------|---------|---------|
| 01 | Unit Tests       | N | N | N | PASS/FAIL |
| 02 | E2E Browser      | N | N | N | PASS/FAIL |
| 03 | Edge Cases       | N | N | N | PASS/FAIL |
| 04 | FHIR Compliance  | N | N | N | PASS/FAIL |
| 05 | Security         | N | N | N | PASS/FAIL |
| 06 | UI/UX            | N | N | N | PASS/FAIL |
| 07 | i18n & Quality   | N | N | N | PASS/FAIL |
| **TOTAL** | | **N** | **N** | **N** | **VERDICT** |

## Auto-Fix Summary
| Iteration | Found | Auto-Fixed | Skipped | Remaining |
|-----------|-------|------------|---------|-----------|
| 1         | N     | N          | N       | N         |
| 2         | N     | N          | N       | N         |

## Files Modified by Auto-Fix
| File | Fixes | What Changed |
|------|-------|-------------|
| stockMoveService.ts | 3 | Replaced hardcoded URLs, removed console.log |

## Remaining Issues (Manual Review Required)
[Any findings the pipeline couldn't safely auto-fix — grouped by severity]

### Immediate (blocks deploy)
- [Critical findings that must be fixed manually]

### Soon (next sprint)
- [Important findings that should be addressed]

### Backlog (when time permits)
- [Minor findings for later]

---

## Part 1: Unit Tests
[Full content from 01-unit-tests.md]

## Part 2: E2E Browser Tests
[Full content from 02-e2e-browser.md]

## Part 3: Edge Case Analysis
[Full content from 03-edge-cases.md]

## Part 4: FHIR Compliance
[Full content from 04-fhir-compliance.md]

## Part 5: Security Scan
[Full content from 05-security.md]

## Part 6: UI/UX Testing
[Full content from 06-ui-ux.md]

## Part 7: i18n & Code Quality
[Full content from 07-i18n-quality.md]
```

### Cleanup

**Always clean up these:**
```bash
rm -f qa-reports/.pipeline-state.json
rm -rf qa-reports/.fix-logs
```

**If overall verdict is PASS or PASS WITH WARNINGS:**
```bash
rm -rf qa-reports/.parts
npx tsx scripts/playwright/cmd.ts stop
lsof -ti :3000 | xargs kill -9 2>/dev/null
```

**If overall verdict is FAIL:**

Keep the `.parts/` directory and servers running for debugging. Tell the user:
```
Servers left running for debugging. When done, run:
  npx tsx scripts/playwright/cmd.ts stop
  lsof -ti :3000 | xargs kill -9 2>/dev/null
  rm -rf qa-reports/.parts
```

## Final Output

Tell the user:
1. The overall verdict (PASS/FAIL/WARNINGS)
2. How many issues were auto-fixed and in how many iterations
3. The report file path
4. A brief summary of remaining issues requiring manual review (if any)
