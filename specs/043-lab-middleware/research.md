# Research Decisions: MediMind Lab Middleware

**Phase 0 Output** — All technical unknowns resolved before design.

---

## Decision 1: ASTM Parser Architecture

**Decision**: Separate ASTM into three focused modules — `checksum.ts` (pure math), `transport.ts` (state machine), `parser.ts` (record parsing).

**Rationale**: The ASTM spec has two layers (E1381 transport + E1394 records) with clearly distinct responsibilities. Separating checksum from transport makes checksums independently testable. Each module stays under 200 lines per CLAUDE.md guidelines.

**Alternatives Rejected**:
- Single monolithic ASTM module — too complex to test, violates simplicity principle.
- Third-party `astm-protocol` npm package — none exist that are maintained or TypeScript-native.

**Source**: `research/01-astm-protocol.md` sections 2.4, 5.1

---

## Decision 2: HL7v2 Parsing Approach

**Decision**: Write a custom ORU^R01 parser (not using `hl7-standard` or `hl7js` npm packages).

**Rationale**: We only need to parse ONE message type (ORU^R01) from ONE analyzer (Mindray BC-3510). A full HL7v2 engine is overkill — thousands of lines of code we'd never use. Our custom parser is ~100 lines: split by `\r`, split by `|`, extract fields by position.

**Alternatives Rejected**:
- `hl7-standard` npm — Large dependency (30+ files), handles all HL7 versions, most of which we don't need. Also generates unnecessary complexity.
- `node-hl7-complete` — Abandoned (last update 2019).

**Source**: `research/02-hl7v2-protocol.md` section 9

---

## Decision 3: Serial Port Mocking Strategy

**Decision**: Create a `MockSerialPort` class extending EventEmitter that matches the `serialport` API surface we use (open, close, write, on('data'), on('error')).

**Rationale**: The `serialport` library requires native bindings and physical hardware. For testing, we need a lightweight mock that lets us simulate bytes flowing in and out. By extending EventEmitter and implementing just the methods we use, tests run instantly without any hardware.

**Alternatives Rejected**:
- `@serialport/binding-mock` — Official mock exists but requires the full serialport binding stack. Adds complexity.
- Mocking with vitest.mock() — Too brittle; doesn't simulate the EventEmitter data flow properly.

**Source**: `research/05-nodejs-serial-tcp-patterns.md` section 1

---

## Decision 4: Offline Queue Storage

**Decision**: SQLite via `better-sqlite3` with WAL (Write-Ahead Logging) mode enabled.

**Rationale**: SQLite is file-based (survives crashes and reboots), has zero configuration, and `better-sqlite3`'s synchronous API eliminates race conditions in queue operations. WAL mode allows concurrent reads while writing. For testing, use `:memory:` mode — instant, no cleanup.

**Alternatives Rejected**:
- JSON file queue — No ACID guarantees, corruption risk during power loss.
- Redis — Requires a separate service; overkill for a single-machine queue.
- LevelDB — Less familiar, no SQL query support for audit trail.

**Source**: `research/05-nodejs-serial-tcp-patterns.md` section 6

---

## Decision 5: FHIR Resource Creation Strategy

**Decision**: Use Medplum transaction bundles (`executeBatch()`) to atomically create all Observations + DiagnosticReport in one API call.

**Rationale**: A single CBC test produces 20+ Observations and 1 DiagnosticReport. If we create them one-by-one and a network error occurs halfway, we'd have partial results in Medplum. Transaction bundles are atomic — all-or-nothing. This matches the existing EMR pattern in `labResultService.ts`.

**Alternatives Rejected**:
- Individual `createResource()` calls — Risk of partial results on network errors.
- Batch (not transaction) bundle — Not atomic; individual entries can fail independently.

**Source**: `research/06-fhir-lab-medplum.md` sections 4, 5

---

## Decision 6: FHIR Observation Status

**Decision**: Always send Observations with status `preliminary`. The EMR promotes to `final` after lab tech verification.

**Rationale**: The middleware is a "dumb pipe" — it delivers results but doesn't verify them. The MediMind EMR has an auto-verification service that promotes results to `final` if they're within reference ranges, or flags them for manual review. Setting `preliminary` ensures the EMR verification workflow works correctly.

**Source**: `research/06-fhir-lab-medplum.md` section 1.2, CLAUDE.md EMR types

---

## Decision 7: Auto-Reconnection Strategy

**Decision**: Exponential backoff starting at 1 second, doubling each attempt, capped at 30 seconds. Reset backoff on successful connection.

**Rationale**: Fast initial retries catch brief glitches (cable jiggle). Exponential growth prevents hammering a dead connection. 30-second cap ensures we reconnect within the 30-second SC-003 requirement once connectivity is restored.

**Backoff sequence**: 1s → 2s → 4s → 8s → 16s → 30s → 30s → 30s → ...

**Source**: `research/05-nodejs-serial-tcp-patterns.md` section 4

---

## Decision 8: Analyzer Test Code Mapping Structure

**Decision**: One mapping file per analyzer in `src/mappers/analyzerMappings/`. Each exports a `Record<string, { loinc: string; display: string; unit: string }>` keyed by the analyzer's proprietary test code.

**Rationale**: Different analyzers use different codes for the same test (e.g., Sysmex calls white blood cells "WBC" while Roche may call it "WBC" too but with a different numeric ID in the ASTM message). Each mapping file is small (~20-50 lines), easy to maintain, and independently testable.

**Source**: `research/03-hematology-analyzers.md`, `research/04-chemistry-immunoassay-analyzers.md`

---

## Decision 9: Barcode Matching Strategy

**Decision**: Look up Specimen by barcode identifier, then find ServiceRequest via Specimen's basedOn reference.

**Lookup order**:
1. Search `Specimen?identifier=<barcode>` in Medplum
2. From the Specimen, follow `request` reference to get the ServiceRequest
3. From the ServiceRequest, get the Patient reference
4. If not found: log error + queue for manual review (don't discard)

**Rationale**: The MediMind EMR creates Specimen resources with an 8-digit barcode in the `identifier` field when the lab tech prints the label. This is the primary link between the physical sample and the digital order.

**Source**: CLAUDE.md (EMR barcode service section), `research/06-fhir-lab-medplum.md` section 3

---

## Decision 10: Siemens LIS3 and Combilyzer Handling

**Decision**:
- **Siemens LIS3**: Implement a stub driver that logs "Siemens LIS3 not yet implemented" and keeps the analyzer disabled in config. Will be implemented when vendor specification document is obtained.
- **Combilyzer 13**: Implement a best-effort parser based on the simplified ASTM-like format. Conservative parsing — log everything, fail gracefully on unexpected formats.

**Rationale**: We can't implement Siemens LIS3 without the proprietary spec (document 10844061). The Combilyzer format is simpler (unidirectional, no handshake) and can be reverse-engineered from sample output.

**Source**: `research/01-astm-protocol.md` section 5.3 (vendor quirks)
