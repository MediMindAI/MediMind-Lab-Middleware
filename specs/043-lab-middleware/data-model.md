# Data Model: MediMind Lab Middleware

**Phase 1 Output** — Entity definitions, relationships, and state transitions.

---

## Entity Overview

```
┌──────────────┐     ┌───────────────┐     ┌────────────────┐
│ AnalyzerConfig│────→│ Connection     │────→│ Protocol Driver │
│ (JSON config) │     │ (Serial/TCP)   │     │ (ASTM/HL7/etc) │
└──────────────┘     └───────────────┘     └───────┬────────┘
                                                    │
                                                    ▼
                                            ┌───────────────┐
                                            │ LabResult      │
                                            │ (standard fmt) │
                                            └───────┬───────┘
                                                    │
                              ┌─────────────────────┤
                              ▼                     ▼
                     ┌────────────────┐    ┌─────────────────┐
                     │ MessageLogEntry │    │ FHIR Resources   │
                     │ (audit trail)   │    │ (Obs + DiagRpt)  │
                     └────────────────┘    └────────┬────────┘
                                                    │
                                          ┌─────────┴─────────┐
                                          ▼                   ▼
                                   ┌────────────┐     ┌──────────────┐
                                   │ Send to     │     │ QueueEntry    │
                                   │ Medplum     │     │ (if offline)  │
                                   └────────────┘     └──────────────┘
```

---

## Entity: AnalyzerConfig

**What it is**: Configuration for one physical lab machine. Lives in `config/analyzers.json`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier (e.g., "sysmex-xn550") |
| name | string | Yes | Human-readable name (e.g., "Sysmex XN-550") |
| protocol | 'astm' \| 'hl7v2' \| 'siemens-lis3' \| 'combilyzer' | Yes | Communication protocol |
| connection | 'serial' \| 'tcp' | Yes | Physical connection type |
| enabled | boolean | Yes | Whether to connect to this analyzer |
| port | string | If serial | COM port (e.g., "COM3") |
| baudRate | number | If serial | Communication speed (default 9600) |
| dataBits | 7 \| 8 | If serial | Data bits per byte (default 8) |
| parity | 'none' \| 'even' \| 'odd' | If serial | Parity check (default 'none') |
| stopBits | 1 \| 2 | If serial | Stop bits (default 1) |
| host | string | If tcp | IP address |
| tcpPort | number | If tcp | TCP port number |

**Validation rules**: No duplicate IDs. No duplicate serial ports among enabled analyzers.

Already implemented in `src/types/analyzer.ts`.

---

## Entity: AnalyzerStatus

**What it is**: Runtime connection status of an analyzer. Kept in memory, exposed via REST API.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Analyzer ID |
| name | string | Analyzer name |
| protocol | AnalyzerProtocol | Communication protocol |
| connected | boolean | Currently connected? |
| lastMessageTime | string \| null | ISO timestamp of last message received |
| lastErrorTime | string \| null | ISO timestamp of last error |
| lastError | string \| null | Last error message |
| messagesReceived | number | Total messages received since startup |
| errorsCount | number | Total errors since startup |
| upSince | string \| null | ISO timestamp of current connection start |

Already implemented in `src/types/analyzer.ts`.

---

## Entity: LabResult

**What it is**: A parsed, protocol-agnostic lab result. The "common language" between protocol drivers and the FHIR mapper.

| Field | Type | Description |
|-------|------|-------------|
| messageId | string | Unique ID for tracking (UUID) |
| analyzerId | string | Which analyzer sent this |
| specimenBarcode | string | 8-digit barcode linking to Specimen in Medplum |
| patientId | string | Patient ID from analyzer (may be empty) |
| patientName | string | Patient name from analyzer (may be empty) |
| testDateTime | string | ISO timestamp of when test was performed |
| receivedAt | string | ISO timestamp of when middleware received it |
| components | ComponentResult[] | Individual test values |
| rawMessage | string | Full raw message for audit trail |
| processingStatus | 'received' \| 'parsed' \| 'mapped' \| 'sent' \| 'error' | Current processing stage |
| error | string? | Error message if processing failed |

Already implemented in `src/types/result.ts`.

### Sub-entity: ComponentResult

**What it is**: One test measurement within a LabResult (e.g., "WBC = 7.5 x10^3/uL").

| Field | Type | Description |
|-------|------|-------------|
| testCode | string | Analyzer's test code (e.g., "WBC") |
| testName | string | Human-readable name (e.g., "White Blood Cell Count") |
| value | string | Result value (numeric or text) |
| unit | string | Unit of measurement (e.g., "x10^3/uL") |
| referenceRange | string | Normal range (e.g., "4.5-11.0") |
| flag | ResultFlag | 'N' \| 'L' \| 'H' \| 'LL' \| 'HH' \| 'A' \| '' |
| status | 'preliminary' \| 'final' \| 'corrected' | Result status |

Already implemented in `src/types/result.ts`.

---

## Entity: AnalyzerMapping

**What it is**: Translation dictionary from an analyzer's proprietary test codes to LOINC codes and display names. One mapping set per analyzer model.

| Field | Type | Description |
|-------|------|-------------|
| analyzerTestCode | string (key) | Analyzer's proprietary code (e.g., "WBC") |
| loinc | string | LOINC code (e.g., "6690-2") |
| display | string | Human-readable name (e.g., "White Blood Cell Count") |
| unit | string | UCUM unit (e.g., "10*3/uL") |
| defaultReferenceRange | string? | Typical reference range if analyzer doesn't provide one |

**New file to create**: `src/mappers/analyzerMappings/types.ts`

---

## Entity: QueueEntry

**What it is**: A LabResult that couldn't be sent to Medplum (internet down) and is waiting for retry.

| Field | Type | Description |
|-------|------|-------------|
| id | number (auto) | SQLite primary key |
| messageId | string | Links to the LabResult.messageId |
| analyzerId | string | Which analyzer sent this |
| payload | string | JSON-serialized LabResult |
| status | 'pending' \| 'processing' \| 'sent' \| 'failed' | Current queue status |
| attempts | number | Number of send attempts |
| maxRetries | number | Maximum retry attempts (from config) |
| lastAttemptAt | string \| null | ISO timestamp of last attempt |
| nextRetryAt | string \| null | ISO timestamp for next retry |
| createdAt | string | ISO timestamp when queued |
| error | string? | Last error message |

**SQLite table**: `queue`

---

## Entity: MessageLogEntry

**What it is**: Audit trail record for every message received from analyzers.

| Field | Type | Description |
|-------|------|-------------|
| id | number (auto) | SQLite primary key |
| timestamp | string | ISO timestamp |
| analyzerId | string | Analyzer ID |
| analyzerName | string | Analyzer display name |
| direction | 'inbound' \| 'outbound' | Message direction |
| protocol | string | Protocol used (astm, hl7v2, etc.) |
| rawContent | string | Full raw message bytes (base64 for binary) |
| parsedSummary | string | Human-readable summary of parsed content |
| fhirResourceIds | string | JSON array of created FHIR resource IDs |
| status | 'success' \| 'parse-error' \| 'send-error' \| 'queued' | Processing outcome |
| errorMessage | string? | Error details if failed |

**SQLite table**: `message_log`

Already defined in `src/types/result.ts`.

---

## State Transitions

### LabResult.processingStatus

```
received → parsed → mapped → sent
    │         │        │
    └─────────┴────────┴──→ error
```

- `received`: Raw bytes captured from analyzer
- `parsed`: Protocol-specific parsing complete (ASTM records or HL7 segments extracted)
- `mapped`: Converted to standard LabResult with LOINC codes
- `sent`: FHIR resources created in Medplum
- `error`: Failed at any stage (error message stored)

### QueueEntry.status

```
pending → processing → sent
    │          │
    │          └──→ pending (retry)
    │          └──→ failed (max retries exceeded)
    └──→ failed (if enqueue fails)
```

### AnalyzerStatus.connected

```
    ┌──→ connected ──→ disconnected ──┐
    │                                  │
    └──────── auto-reconnect ◄────────┘
              (exponential backoff)
```

---

## SQLite Schema

### Table: queue

```sql
CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  analyzer_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 10,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  error TEXT
);

CREATE INDEX idx_queue_status ON queue(status);
CREATE INDEX idx_queue_next_retry ON queue(next_retry_at);
```

### Table: message_log

```sql
CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  analyzer_id TEXT NOT NULL,
  analyzer_name TEXT NOT NULL,
  direction TEXT NOT NULL,
  protocol TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  parsed_summary TEXT,
  fhir_resource_ids TEXT DEFAULT '[]',
  status TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX idx_message_log_timestamp ON message_log(timestamp);
CREATE INDEX idx_message_log_analyzer ON message_log(analyzer_id);
CREATE INDEX idx_message_log_status ON message_log(status);
```

---

## FHIR Resource Mapping

### LabResult → FHIR Observation (one per ComponentResult)

| LabResult / ComponentResult Field | FHIR Observation Field |
|-----------------------------------|----------------------|
| componentResult.testCode + mapping.loinc | `code.coding[]` |
| componentResult.value | `valueQuantity.value` or `valueString` |
| componentResult.unit (→ UCUM) | `valueQuantity.unit`, `valueQuantity.code` |
| componentResult.flag → interpretation | `interpretation[].coding[]` |
| componentResult.referenceRange | `referenceRange[].low/high` |
| componentResult.status | `status` |
| specimenBarcode → Specimen lookup | `specimen` (Reference) |
| specimenBarcode → ServiceRequest lookup | `basedOn[]` (Reference) |
| testDateTime | `effectiveDateTime` |
| receivedAt | `issued` |
| messageId | `extension[lis-message-id]` |
| analyzerId → analyzer name | `performer[]` (Device reference) |

### LabResult → FHIR DiagnosticReport (one per LabResult)

| LabResult Field | FHIR DiagnosticReport Field |
|-----------------|---------------------------|
| all Observation refs | `result[]` (References) |
| specimenBarcode → ServiceRequest | `basedOn[]` (Reference) |
| specimenBarcode → Specimen | `specimen[]` (Reference) |
| testDateTime | `effectiveDateTime` |
| receivedAt | `issued` |
| 'preliminary' | `status` |
| 'LAB' category | `category[]` |

### Abnormal Flag Mapping

| Analyzer Flag | FHIR Interpretation Code | Display |
|--------------|-------------------------|---------|
| N | N | Normal |
| L | L | Low |
| H | H | High |
| LL | LL | Critical low |
| HH | HH | Critical high |
| A | A | Abnormal |
| (empty) | (omitted) | No interpretation |

FHIR system: `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation`
