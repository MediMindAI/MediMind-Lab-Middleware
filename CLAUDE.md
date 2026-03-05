# CLAUDE.md — MediMind Lab Middleware

## Claude Rules
1. Before making significant changes, check in with me to verify the approach.
2. Give me a high level explanation of what changes you made at each step.
3. Make every task and code change as simple as possible. Avoid massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.

## Communication Style
1. Explain everything in plain language first - like you're explaining to a smart friend who isn't a developer yet. Then show the technical details.
2. Use real-world analogies for complex concepts.
3. When presenting a plan, always explain the WHY (the problem/goal) before the WHAT (the solution).
4. If you use a technical term, briefly define it in parentheses the first time.
5. For code changes, explain what the code does in human terms.
6. Keep explanations concise - teach, don't lecture. A short analogy beats a long paragraph.

## Agent Model Rule (CRITICAL)
- **ALWAYS use `model: "opus"` for ALL spawned agents** — no exceptions
- Never use sonnet or haiku for any agent (Plan, Explore, coder, etc.)

---

## The Big Picture — Why This Project Exists

### The Problem

We built **MediMind EMR** — a full hospital management system (React, TypeScript, FHIR R4, Medplum Cloud). It has a complete lab module where doctors order tests, lab techs track specimens, and results appear in patient charts.

But there's a gap: **the physical lab machines (analyzers) that actually run the blood tests can't talk to our EMR.** Right now, the hospital uses a **custom Georgian LIS** (Laboratory Information System) as a middleman — analyzers send results to the old LIS, which then pushes them to the old EMR.

**We're replacing the entire chain.** This middleware replaces the Georgian LIS. MediMind EMR replaces the old EMR.

### The Current Flow (What We're Replacing)

```
Lab Analyzers → Georgian LIS (custom software) → Old Hospital EMR
                    ↑ WE REPLACE THIS ↑           ↑ ALREADY REPLACED ↑
```

### The New Flow (What We're Building)

```
Lab Analyzers → THIS MIDDLEWARE → Medplum Cloud → MediMind EMR
   (10 machines)   (this repo)      (FHIR DB)     (separate repo)
```

### What This Middleware Does

It's a **translator** — a small program that runs on a PC in the hospital lab. It:
1. Listens to lab machines speaking ASTM/HL7v2 (the "languages" lab machines speak)
2. Parses the results (extracts test values like "WBC = 7.5")
3. Converts them to FHIR resources (the standard medical data format)
4. Sends them to Medplum Cloud (the FHIR database)
5. MediMind EMR picks them up automatically

**This middleware has NO UI.** It runs silently in the background. The UI is MediMind EMR.

---

## The MediMind EMR Side (Separate Repo — Already Built)

**Repo location:** `/Users/toko/Desktop/medplum_medimind`

The EMR already has a full lab module with these capabilities that are **ready and waiting** for this middleware to feed them data:

### What's Already Built in MediMind EMR

| Component | File/Location | What It Does |
|-----------|--------------|-------------|
| **LIS Adapter Interface** | `packages/app/src/emr/services/laboratory/lis/LISAdapter.ts` | Plug-and-play interface — just implement one class to connect |
| **Simulated LIS Adapter** | `packages/app/src/emr/services/laboratory/lis/SimulatedLISAdapter.ts` | Working simulation we'll replace with a real adapter |
| **Result Poller** | `packages/app/src/emr/hooks/laboratory/useLISResultPoller.ts` | Polls every 5 seconds for new results from middleware |
| **Poller Context** | `packages/app/src/emr/contexts/LISPollerContext.tsx` | Runs at lab section level, always listening |
| **Retry Queue** | `packages/app/src/emr/services/laboratory/lisRetryQueue.ts` | Retries failed transmissions (localStorage, max 5 retries) |
| **LIS Monitoring Dashboard** | `packages/app/src/emr/views/laboratory/LISTab.tsx` | Connection status, message logs, retry buttons |
| **LIS Monitor Table** | `packages/app/src/emr/components/laboratory/lis/LISMonitorTable.tsx` | 16-column order monitor with search |
| **Barcode Generation** | `packages/app/src/emr/services/laboratory/specimenLabelService.ts` | 8-digit Code128 barcodes with collision checking |
| **Barcode Printing** | `packages/app/src/emr/services/laboratory/barcodePrintService.ts` | Print 60x25mm specimen labels via JsBarcode |
| **Barcode Scanning** | `packages/app/src/emr/components/laboratory/collection/BarcodeInput.tsx` | USB scanner + mobile camera support |
| **Specimen Tracking** | `packages/app/src/emr/services/laboratory/specimenService.ts` | Full FHIR Specimen lifecycle (create, collect, receive) |
| **Lab Kanban Board** | `packages/app/src/emr/services/laboratory/kanbanQueueService.ts` | 5-stage workflow: ordered → collected → in-progress → resulted → verified |
| **Auto-Verification** | `packages/app/src/emr/services/laboratory/autoVerificationService.ts` | Auto-verifies results within reference ranges |
| **FHIR LIS Extensions** | `packages/app/src/emr/constants/fhir-systems.ts` (lines 1138-1175) | Extension URLs for transmission status, barcode, protocol, etc. |
| **Result Types** | `packages/app/src/emr/types/laboratory.ts` (lines 930-984) | `WebLabOrderPayload`, `WebLabResultPayload`, `WebLabComponentResult` |
| **Integration Service** | `packages/app/src/emr/services/laboratory/lisIntegrationService.ts` | Coordinates between LIS adapter and FHIR resources |

### How MediMind EMR Connects to This Middleware

The EMR uses an **adapter pattern** (think of it like a USB adapter — same plug, different device):

```typescript
// In MediMind EMR — packages/app/src/emr/services/laboratory/lis/LISAdapter.ts
interface LISAdapter {
  sendOrder(payload: WebLabOrderPayload): Promise<void>;
  pollResults(barcode: string): Promise<WebLabResultPayload | null>;
  getConnectionStatus(): Promise<LISConnectionStatus>;
  getMessageLog(): Promise<LISMessage[]>;
  retryMessage(messageId: string): Promise<void>;
}
```

Currently `VITE_LIS_MODE=simulated` uses the `SimulatedLISAdapter`. When this middleware is ready:
1. We implement a `RealLISAdapter` class that calls this middleware's REST API
2. Set `VITE_LIS_MODE=weblab`
3. The entire EMR lab module instantly works with real analyzer data

### Key EMR Types This Middleware Must Match

```typescript
// WebLabResultPayload — what the EMR expects to receive
interface WebLabResultPayload {
  barcode: string;           // Specimen barcode (8-digit)
  orderId: string;           // ServiceRequest ID
  isComplete: boolean;       // All components received?
  components: WebLabComponentResult[];
  instrumentName: string;    // e.g., "Sysmex XN-550"
  instrumentFlags?: string[];
}

// WebLabComponentResult — one test value
interface WebLabComponentResult {
  componentCode: string;     // e.g., "WBC"
  value: string;             // e.g., "7.5"
  unit: string;              // e.g., "x10^3/uL"
  referenceRange: string;    // e.g., "4.5-11.0"
  flag: 'N' | 'H' | 'L' | 'HH' | 'LL' | '';
}
```

### FHIR Resource Pattern

Results must be created as these FHIR resources in Medplum Cloud:

| Resource | Purpose | Key Fields |
|----------|---------|-----------|
| **Observation** | One test result (e.g., WBC = 7.5) | `code`, `valueQuantity`, `referenceRange`, `interpretation`, `specimen` ref |
| **DiagnosticReport** | Groups observations for one test panel | `result[]` (refs to Observations), `basedOn` (ref to ServiceRequest) |
| **Specimen** | Already exists — link by barcode | `identifier` contains the barcode |
| **ServiceRequest** | Already exists — the doctor's order | `identifier` contains barcode, `status` updated |

**FHIR Base URL:** `http://medimind.ge/fhir`
**Extension Pattern:** `http://medimind.ge/fhir/StructureDefinition/[name]`
**Source of Truth for FHIR URLs:** `packages/app/src/emr/constants/fhir-systems.ts` in the EMR repo

### Important FHIR Constants (from EMR repo)

```typescript
// LIS-specific extensions — defined in fhir-systems.ts
LIS_EXTENSIONS = {
  TRANSMISSION_STATUS: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-status',
  TRANSMISSION_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-time',
  MESSAGE_ID: 'http://medimind.ge/fhir/StructureDefinition/lis-message-id',
  PROTOCOL: 'http://medimind.ge/fhir/StructureDefinition/lis-protocol',
  IMPORTED: 'http://medimind.ge/fhir/StructureDefinition/lis-imported',
  IMPORT_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-import-time',
  BARCODE: 'http://medimind.ge/fhir/StructureDefinition/lis-barcode',
}

// Transmission status values
type TransmissionStatus = 'not-sent' | 'pending' | 'sent' | 'acknowledged' | 'completed' | 'error';
```

---

## This Middleware — Technical Details

**Tech Stack:** TypeScript, Node.js, serialport (RS-232), Express (REST API), better-sqlite3 (local queue), @medplum/core (FHIR client)

### Architecture

```
Physical Lab Analyzers (10 machines)
    │
    ├── ASTM E1394 over Serial/TCP (8 analyzers)
    ├── HL7v2 over MLLP/TCP (1 analyzer — Mindray)
    └── Siemens LIS3 proprietary (1 analyzer — RapidPoint 500e)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  This Middleware Service (runs on hospital lab PC)       │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │ ASTM Driver  │  │ HL7v2 Driver│  │ Siemens Driver │  │
│  │ (8 machines) │  │ (Mindray)   │  │ (RapidPoint)   │  │
│  └──────┬───────┘  └──────┬──────┘  └───────┬────────┘  │
│         │                 │                  │           │
│         └────────┬────────┘──────────────────┘           │
│                  ▼                                       │
│         ┌────────────────┐                               │
│         │ Result Mapper   │ → Standard LabResult format   │
│         └────────┬───────┘                               │
│                  ▼                                       │
│         ┌────────────────┐                               │
│         │ FHIR Mapper     │ → Observation + DiagReport    │
│         └────────┬───────┘                               │
│                  ▼                                       │
│    ┌─────────────┴──────────────┐                        │
│    │                            │                        │
│    ▼                            ▼                        │
│ ┌──────────┐            ┌──────────────┐                 │
│ │ Send to   │  offline → │ Local Queue   │                │
│ │ Medplum   │  ◄──────── │ (SQLite)      │                │
│ └──────────┘            └──────────────┘                 │
│                                                         │
│  ┌──────────────┐  ┌──────────────────┐                  │
│  │ REST API      │  │ Message Logger    │                  │
│  │ :3001         │  │ (audit trail)     │                  │
│  └──────────────┘  └──────────────────┘                  │
└─────────────────────────────────────────────────────────┘
    │                              │
    ▼ HTTPS                        ▼ REST API
┌───────────────┐         ┌──────────────────┐
│ Medplum Cloud  │         │ MediMind EMR      │
│ (FHIR R4)      │         │ (queries status,  │
│ api.medplum.com│         │  polls results)   │
└───────────────┘         └──────────────────┘
```

### Target Analyzers

| # | Analyzer | Manufacturer | Type | Protocol | Connection | Direction |
|---|----------|-------------|------|----------|------------|-----------|
| 1 | RapidPoint 500e | Siemens | Blood Gas | Siemens LIS3 (proprietary) | Serial + Ethernet | Bidirectional |
| 2 | BC-3510 | Mindray | Hematology (CBC) | HL7 v2.3.1 + ASTM | Serial (DB-9) | Bidirectional |
| 3 | Maglumi X3 | Snibe | Immunoassay | ASTM E1394 + HL7 | Serial + TCP/IP | Bidirectional |
| 4 | Combilyzer 13 | 77 Elektronika | Urinalysis | Proprietary serial | Serial only | Unidirectional |
| 5 | Cobas c 111 | Roche | Chemistry | ASTM E1381/E1394 | Serial (DB-9) | Bidirectional |
| 6 | Cobas e 411 | Roche | Immunoassay | ASTM E1381/E1394 | Serial (DB-9) | Bidirectional |
| 7 | Hitachi 917/7180 | Roche/Hitachi | Chemistry | ASTM E1381/E1394 | Serial | Bidirectional |
| 8 | XN-550 | Sysmex | Hematology | ASTM E1381-02/E1394-97 | Serial + Ethernet | Bidirectional |
| 9 | D-10 | Bio-Rad | HbA1c | LIS1-A/LIS2-A (ASTM) | Serial (DB-9) | Bidirectional |
| 10 | AIA-360 | Tosoh | Immunoassay | ASTM | Serial only | Bidirectional |

**Protocol summary:** 8 of 10 use ASTM. 1 uses HL7v2. 1 uses proprietary Siemens LIS3. All support RS-232 serial at 9600 baud.

**Current mode:** Receive results only (unidirectional from analyzers → middleware). Sending orders TO analyzers is a future enhancement.

---

## Project Structure

```
src/
├── index.ts                    # Entry point — starts all services
├── config/
│   └── configLoader.ts         # Reads analyzers.json + env vars
│
├── protocols/
│   ├── astm/
│   │   ├── transport.ts        # ASTM E1381 low-level (ENQ/ACK/STX/ETX/EOT state machine)
│   │   ├── parser.ts           # ASTM E1394 record parser (H/P/O/R/Q/L records)
│   │   └── types.ts            # ASTM-specific types
│   ├── hl7v2/
│   │   ├── listener.ts         # HL7v2 MLLP TCP listener
│   │   ├── parser.ts           # ORU^R01 message parser (OBX segment extraction)
│   │   └── types.ts            # HL7v2-specific types
│   ├── siemens/
│   │   ├── lis3Driver.ts       # Siemens LIS3 proprietary protocol
│   │   └── types.ts            # LIS3-specific types
│   └── combilyzer/
│       └── parser.ts           # Combilyzer 13 proprietary output parser
│
├── connections/
│   ├── serialConnection.ts     # RS-232 serial port manager (via serialport lib)
│   ├── tcpConnection.ts        # TCP/IP socket manager
│   └── connectionManager.ts    # Manages all analyzer connections, auto-reconnect
│
├── mappers/
│   ├── resultMapper.ts         # Protocol-specific results → standard LabResult
│   ├── fhirMapper.ts           # LabResult → FHIR Observation + DiagnosticReport
│   └── analyzerMappings/       # Per-analyzer test code mappings
│       ├── sysmex-xn550.ts     # Sysmex test codes → LOINC/display names
│       ├── roche-cobas-c111.ts # Roche chemistry test codes
│       └── ...
│
├── fhir/
│   └── medplumClient.ts        # Authenticated Medplum FHIR client
│
├── queue/
│   ├── localQueue.ts           # SQLite-backed offline queue
│   └── retryProcessor.ts       # Processes queued items when internet returns
│
├── api/
│   ├── server.ts               # Express REST API server
│   └── routes/
│       ├── status.ts           # GET /status — analyzer connection states
│       ├── messages.ts         # GET /messages — message audit log
│       └── health.ts           # GET /health — service health check
│
├── logging/
│   └── messageLogger.ts        # Audit trail — every message logged
│
├── types/
│   ├── result.ts               # Standard LabResult + ComponentResult types
│   ├── analyzer.ts             # Analyzer config + status types
│   └── astm.ts                 # ASTM protocol types + control characters
│
└── simulators/                 # Test tools (send fake analyzer messages)
    ├── astmSimulator.ts        # Simulates ASTM analyzer sending results
    └── hl7Simulator.ts         # Simulates HL7v2 analyzer sending results
```

## Development Commands

```bash
npm install                     # Install dependencies
npm run dev                     # Start with hot reload (development)
npm run build                   # Compile TypeScript
npm start                       # Run compiled version (production)
npm test                        # Run tests (vitest)
npm run test:watch              # Run tests in watch mode
npm run simulate:astm           # Send simulated ASTM messages for testing
npm run simulate:hl7            # Send simulated HL7v2 messages for testing
npm run lint                    # Lint code
npm run typecheck               # Type-check without emitting
npm run install-service         # Install as Windows Service
npm run uninstall-service       # Remove Windows Service
```

## Configuration

All analyzer settings in `config/analyzers.json`. Hospital IT edits this file to add/remove/reconfigure analyzers. No code changes needed.

Key sections:
- `analyzers[]` — each machine: name, protocol, connection type, port, baud rate, enabled
- `medplum` — API URL, project ID, client credentials
- `api` — REST API port (default 3001)
- `queue` — offline queue settings (SQLite path, retry interval, max retries)
- `logging` — log level, directory, rotation settings

## Key Conventions

### Code Style
- TypeScript strict mode, ESM modules
- Async/await everywhere (no callbacks)
- Error handling: never swallow errors, always log + report via status API
- Keep files small and focused (~100-200 lines max)
- Every file has a doc comment at the top explaining what it does in plain language

### Protocol Implementation Rules
- ALWAYS send ACK/NAK responses within timeout windows
- ALWAYS validate ASTM frame checksums before processing
- NEVER discard a message — log everything, even malformed ones
- ALWAYS buffer results locally (SQLite queue) before attempting to send to Medplum
- Serial port operations MUST handle "port busy" and "device disconnected" gracefully
- Auto-reconnect on disconnect with exponential backoff

### FHIR Resource Creation
- Use MedplumClient from `@medplum/core`
- Observation resources MUST include: `code`, `valueQuantity`, `unit`, `referenceRange`, `interpretation`
- DiagnosticReport MUST reference all related Observations via `result[]`
- Link results to ServiceRequest via specimen barcode (`Specimen.identifier`)
- Set `LIS_EXTENSIONS.IMPORTED = true` and `LIS_EXTENSIONS.IMPORT_TIME` on Observations
- Set `LIS_EXTENSIONS.TRANSMISSION_STATUS = 'completed'` on ServiceRequest after results sent
- Extension base URL: `http://medimind.ge/fhir/StructureDefinition/`

### Testing
- Vitest for unit tests
- Unit tests for every protocol parser (test with real message samples)
- Integration tests with simulated serial/TCP connections
- Test fixtures in `tests/fixtures/` — real ASTM/HL7 message samples from each analyzer
- Test file pattern: `*.test.ts` colocated next to source files

---

## Deployment

### How It Runs at the Hospital

```
Hospital Lab Room
┌─────────────────────────────────────────────────┐
│  Analyzers ──cables──► Lab PC (Windows, 8GB RAM)│
│                         ├── This middleware runs │
│                         │   as Windows Service   │
│                         └── Auto-starts on boot  │
└─────────────────────────┬───────────────────────┘
                          │ internet (HTTPS)
                          ▼
                   Medplum Cloud (api.medplum.com)
                          │
                          ▼
                   Doctors' browsers → MediMind EMR
```

### As Windows Service
```bash
npm run build
npm run install-service    # Installs as Windows Service via node-windows
```

### As Docker Container
```bash
docker compose up -d
```
Note: Docker needs `--device` flag for serial port access.

---

## Credentials & Environment

### Medplum Cloud Connection
- **API URL:** `https://api.medplum.com/`
- **Project ID:** `71c7841a-7f47-4029-8ab4-0bf62751c173`
- **Client ID:** `c7d601b8-758f-4c90-b4dd-2fe8e1d66973`

### Environment Variables (`.env`)
```env
MEDPLUM_BASE_URL=https://api.medplum.com
MEDPLUM_CLIENT_ID=c7d601b8-758f-4c90-b4dd-2fe8e1d66973
MEDPLUM_CLIENT_SECRET=<secret>
MEDPLUM_PROJECT_ID=71c7841a-7f47-4029-8ab4-0bf62751c173
API_PORT=3001
LOG_LEVEL=info
LOG_DIR=./logs
QUEUE_DB_PATH=./data/queue.db
CONFIG_PATH=./config/analyzers.json
```

---

## Integration Plan — Connecting Middleware ↔ EMR

### Phase 1: Middleware Standalone (Current)
Build and test the middleware with simulated analyzers. All results go to Medplum Cloud.

### Phase 2: Wire Up EMR (After middleware works)
In the MediMind EMR repo (`/Users/toko/Desktop/medplum_medimind`):
1. Create `RealLISAdapter` class implementing `LISAdapter` interface
2. It calls this middleware's REST API (`GET http://<lab-pc>:3001/status`, etc.)
3. The existing `useLISResultPoller` hook already picks up new Observations from Medplum
4. Set `VITE_LIS_MODE=weblab` in EMR's `.env`
5. Everything connects — results flow from analyzers → middleware → Medplum → EMR

### Phase 3: Hospital Deployment
1. Install middleware on lab PC
2. Configure `analyzers.json` with real COM ports / IP addresses
3. Disconnect old Georgian LIS from analyzers
4. Connect analyzers to middleware PC
5. Run parallel with old system for 1-2 weeks
6. Full switchover

---

## Related Files in MediMind EMR Repo

| What | Path in EMR repo |
|------|-----------------|
| LIS Adapter Interface | `packages/app/src/emr/services/laboratory/lis/LISAdapter.ts` |
| Simulated Adapter | `packages/app/src/emr/services/laboratory/lis/SimulatedLISAdapter.ts` |
| Result Poller Hook | `packages/app/src/emr/hooks/laboratory/useLISResultPoller.ts` |
| Poller Context | `packages/app/src/emr/contexts/LISPollerContext.tsx` |
| Retry Queue | `packages/app/src/emr/services/laboratory/lisRetryQueue.ts` |
| LIS Monitoring Tab | `packages/app/src/emr/views/laboratory/LISTab.tsx` |
| Monitor Table | `packages/app/src/emr/components/laboratory/lis/LISMonitorTable.tsx` |
| Integration Service | `packages/app/src/emr/services/laboratory/lisIntegrationService.ts` |
| FHIR Constants | `packages/app/src/emr/constants/fhir-systems.ts` |
| Lab Types | `packages/app/src/emr/types/laboratory.ts` |
| Barcode Service | `packages/app/src/emr/services/laboratory/specimenLabelService.ts` |
| Auto-Verification | `packages/app/src/emr/services/laboratory/autoVerificationService.ts` |
| Kanban Queue | `packages/app/src/emr/services/laboratory/kanbanQueueService.ts` |
| Specimen Service | `packages/app/src/emr/services/laboratory/specimenService.ts` |

## Feature Spec
Full specification: `specs/043-lab-middleware/spec.md`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Serial port access denied | Run as Administrator, or add user to dialout group |
| Port already in use | Check if old Georgian LIS is still running on that COM port |
| Medplum auth fails | Verify client ID/secret in .env, check project ID |
| ASTM checksum errors | Verify baud rate matches analyzer settings (default 9600) |
| No data from analyzer | Check cable, verify analyzer is configured to send to host |
| Results don't appear in EMR | Check Medplum Cloud for new Observations, verify barcode match |
| Middleware crashes on start | Check `config/analyzers.json` for JSON syntax errors |
| Queue growing but not sending | Check internet connectivity, verify Medplum credentials |
