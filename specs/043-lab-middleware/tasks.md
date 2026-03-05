# Tasks: MediMind Lab Middleware

**Input**: Design documents from `/specs/043-lab-middleware/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.yaml
**Tests**: YES — TDD approach, 100% coverage target. Tests written FIRST, then implementation.

**Organization**: Tasks grouped by user story. Optimized for up to 10 parallel agents.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1-US5)
- **Research ref**: Each task includes which research file(s) to read for implementation context

## Research Files (CRITICAL — agents MUST read these)

All research files live at: `/specs/043-lab-middleware/research/`

| File | Contains | Used By |
|------|----------|---------|
| `01-astm-protocol.md` | ASTM E1381 transport, E1394 records, checksum algorithm, state machine, real message examples, vendor quirks | ASTM tasks |
| `02-hl7v2-protocol.md` | MLLP framing, ORU^R01 segments, OBX field positions, ACK construction, Mindray BC-3510 specifics | HL7v2 tasks |
| `03-hematology-analyzers.md` | Sysmex XN-550 + Mindray BC-3510 test codes, LOINC mappings, reference ranges | Mapping tasks |
| `04-chemistry-immunoassay-analyzers.md` | Roche, Bio-Rad, Tosoh, Snibe test codes, LOINC mappings, ASTM samples | Mapping tasks |
| `05-nodejs-serial-tcp-patterns.md` | serialport v12+ API, TCP sockets, auto-reconnect, SQLite queue, Windows service, Winston | Connection + queue tasks |
| `06-fhir-lab-medplum.md` | FHIR Observation/DiagReport structure, Medplum client auth, transaction bundles, extensions | FHIR tasks |

Additional design docs:
- `/specs/043-lab-middleware/data-model.md` — Entity definitions, SQLite schema, FHIR mapping tables
- `/specs/043-lab-middleware/contracts/api.yaml` — OpenAPI spec for REST endpoints
- `/specs/043-lab-middleware/research.md` — Key architectural decisions and rationale

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test framework, mock infrastructure, shared utilities. MUST complete before all other phases.

- [x] T001 [P] Configure Vitest test runner with TypeScript support in `vitest.config.ts`. Set up coverage reporting (istanbul provider). Verify tests run with `npm test`. Add `supertest` as dev dependency for API testing later. **Reference**: `plan.md` Testing Strategy section.

- [x] T002 [P] Create MockSerialPort class in `src/simulators/mockSerial.ts` + `src/simulators/mockSerial.test.ts`. Must extend EventEmitter, implement open/close/write/on('data')/on('error'). Test the mock itself: emit data, emit errors, verify open/close state. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 1 for real SerialPort API to match.

- [x] T003 [P] Create ASTM test fixtures in `src/simulators/fixtures/astm/`. Create fixture files: `sysmex-cbc.txt`, `roche-chemistry.txt`, `roche-immuno.txt`, `bio-rad-hba1c.txt`, `tosoh-immuno.txt`, `snibe-immuno.txt`, `malformed.txt`. Each file contains raw ASTM bytes as they come from the analyzer (with STX/ETX framing). **Reference**: `research/01-astm-protocol.md` section 4 "Real Message Examples" for exact byte sequences. `research/03-hematology-analyzers.md` and `research/04-chemistry-immunoassay-analyzers.md` for analyzer-specific message samples.

- [x] T004 [P] Create HL7v2 test fixtures in `src/simulators/fixtures/hl7v2/`. Create: `mindray-cbc.hl7` (real ORU^R01 from Mindray BC-3510) and `malformed.hl7` (bad messages for error testing). **Reference**: `research/02-hl7v2-protocol.md` section 7 "Real ORU^R01 Message Examples" for exact message content. Section 8 for Mindray-specific fields.

- [x] T005 [P] Create Combilyzer test fixture in `src/simulators/fixtures/combilyzer/urinalysis.txt`. Contains sample proprietary output from Combilyzer 13. **Reference**: `research/01-astm-protocol.md` section 5.3 "Vendor Quirks" for Combilyzer format details.

- [x] T006 [P] Write comprehensive unit tests for configLoader in `src/config/configLoader.test.ts`. Test cases: valid config loads correctly, missing analyzers array throws, missing medplum config throws, duplicate IDs throw, duplicate serial ports throw, env var overrides work, empty enabled analyzers warns. Use temp JSON files for test configs. **Reference**: existing `src/config/configLoader.ts`, `config/analyzers.json`.

- [x] T007 [P] Create Winston app logger in `src/logging/appLogger.ts` + `src/logging/appLogger.test.ts`. Configurable log level, console + file transports, daily rotation, structured JSON format. Tests: logger creates with correct level, respects log level filtering, formats messages correctly. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 8 for Winston setup patterns.

**Checkpoint**: Test runner works, mocks ready, fixtures created, config loader tested, logger ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, connection interfaces, and mapping infrastructure that ALL user stories need.

**CRITICAL**: No user story work can begin until this phase completes.

- [x] T008 [P] Create connection interface types in `src/connections/types.ts` + test. Define `IConnection` interface with methods: open(), close(), write(data), on('data'), on('error'), on('close'), isOpen(). Define `ConnectionEvent` types. Test: interface satisfies TypeScript compiler checks. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` sections 1-3 for API surface.

- [x] T009 [P] Create HL7v2 types in `src/protocols/hl7v2/types.ts`. Define: `HL7v2Message`, `HL7v2Segment`, `MSHSegment`, `PIDSegment`, `OBRSegment`, `OBXSegment`, `ORUMessage`. **Reference**: `research/02-hl7v2-protocol.md` sections 3-5 for field definitions.

- [x] T010 [P] Create Combilyzer types in `src/protocols/combilyzer/types.ts`. Define: `CombilyzerResult`, `CombilyzerParameter` for the simplified proprietary format. **Reference**: `research/01-astm-protocol.md` section 5.3 for Combilyzer format.

- [x] T011 [P] Create Siemens LIS3 stub types and driver in `src/protocols/siemens/types.ts` and `src/protocols/siemens/lis3Driver.ts`. Stub driver logs "Siemens LIS3 not implemented — awaiting vendor spec document 10844061" and returns disabled status. No real implementation needed. **Reference**: `research.md` Decision 10.

- [x] T012 [P] Create analyzer mapping types in `src/mappers/analyzerMappings/types.ts`. Define `AnalyzerMappingEntry` type: `{ loinc: string; display: string; unit: string; defaultReferenceRange?: string }`. Define `AnalyzerMapping` as `Record<string, AnalyzerMappingEntry>`. **Reference**: `data-model.md` "Entity: AnalyzerMapping".

- [x] T013 [P] Create FHIR-related types in `src/fhir/types.ts`. Define: `FHIRCreateResult`, `BarcodeMatch` (with specimen/serviceRequest/patient references), `MedplumConfig`. Import and use @medplum/fhirtypes where possible. **Reference**: `research/06-fhir-lab-medplum.md` section 1 for Observation structure, `data-model.md` "FHIR Resource Mapping".

- [x] T014 [P] Create pipeline event types in `src/pipeline/types.ts`. Define: `PipelineEvent` (with stage, data, error), `PipelineStage` enum (received/parsed/mapped/sent/error). **Reference**: `data-model.md` "State Transitions" section.

**Checkpoint**: All interfaces and types defined. Agents working on user stories can now import these.

---

## Phase 3: User Story 1 — Receive Results Automatically (Priority: P1) MVP

**Goal**: Lab machine sends result → middleware receives → parses → converts to FHIR → sends to Medplum. This is the ENTIRE core pipeline.

**Independent Test**: Send simulated ASTM/HL7 message → verify FHIR Observation + DiagnosticReport created with correct values.

### Tests for User Story 1

> **Write tests FIRST, ensure they FAIL before implementation**

- [x] T015 [P] [US1] Write ASTM checksum tests in `src/protocols/astm/checksum.test.ts`. Test cases: known-good checksum from ASTM spec example, empty frame, single character, multi-frame. Use examples from research. **Reference**: `research/01-astm-protocol.md` section 2.4 "Checksum Calculation" — contains the exact algorithm and test vectors.

- [x] T016 [P] [US1] Write ASTM transport state machine tests in `src/protocols/astm/transport.test.ts`. Test cases: idle→ENQ→receiving, STX→data→ETX/ETB→ACK, EOT→idle, NAK retry (max 6), timeout (15s/30s), corrupt frame→NAK, contention (both sides ENQ simultaneously). **Reference**: `research/01-astm-protocol.md` sections 2.2-2.10 for the full state machine spec, section 2.6 for timeout values, section 2.7 for NAK retry behavior.

- [x] T017 [P] [US1] Write ASTM record parser tests in `src/protocols/astm/parser.test.ts`. Test cases: parse H record (header), P record (patient), O record (order with specimen barcode), R record (result with value/unit/flag), L record (terminator), full H→P→O→R→L message assembly, multi-patient message, missing fields. Use fixture files. **Reference**: `research/01-astm-protocol.md` sections 3.4-3.10 for field positions per record type. Use `src/simulators/fixtures/astm/sysmex-cbc.txt` as primary test input.

- [x] T018 [P] [US1] Write MLLP transport tests in `src/protocols/hl7v2/mllpTransport.test.ts`. Test cases: extract message from VT+data+FS+CR frame, buffer partial frames, handle multiple messages in one TCP chunk, reject data without VT start, handle FS without preceding VT. **Reference**: `research/02-hl7v2-protocol.md` section 1 "MLLP" for framing bytes (0x0B, 0x1C, 0x0D).

- [x] T019 [P] [US1] Write HL7v2 ORU^R01 parser tests in `src/protocols/hl7v2/parser.test.ts`. Test cases: parse MSH segment (sender, message type, version), PID segment (patient ID, name), OBR segment (order number), OBX segments (test code, value, unit, reference range, abnormal flag, result status), full ORU^R01 with multiple OBX. Use fixture file. **Reference**: `research/02-hl7v2-protocol.md` sections 3-5 for segment field positions. Use `src/simulators/fixtures/hl7v2/mindray-cbc.hl7` as test input.

- [x] T020 [P] [US1] Write HL7v2 ACK builder tests in `src/protocols/hl7v2/ack.test.ts`. Test cases: build AA (accept) ACK, build AE (error) ACK, build AR (reject) ACK. Verify correct MSH/MSA segment format. **Reference**: `research/02-hl7v2-protocol.md` section 6 "ACK Message".

- [x] T021 [P] [US1] Write result mapper tests in `src/mappers/resultMapper.test.ts`. Test cases: convert ASTMMessage → LabResult[] (correct barcode, components, flags), convert HL7v2 ORU → LabResult[], handle missing barcode, handle unknown test codes, apply LOINC mappings from analyzerMappings. **Reference**: `data-model.md` "Entity: LabResult" for expected output structure.

- [x] T022 [P] [US1] Write FHIR mapper tests in `src/mappers/fhirMapper.test.ts`. Test cases: LabResult → FHIR Observation (correct code.coding with LOINC, valueQuantity, interpretation for H/L/HH/LL/N flags, referenceRange, specimen/basedOn refs, category=laboratory, status=preliminary, MediMind LIS extensions). LabResult → FHIR DiagnosticReport (result[] refs, basedOn, specimen, status=preliminary). **Reference**: `research/06-fhir-lab-medplum.md` sections 1-3 for resource structure. `data-model.md` "FHIR Resource Mapping" tables. CLAUDE.md "FHIR Resource Creation" and "LIS_EXTENSIONS" for extension URLs.

- [x] T023 [P] [US1] Write Medplum client wrapper tests in `src/fhir/medplumClient.test.ts`. Test cases: createClient with credentials, searchOne returns resource, searchOne returns null, createResource succeeds, executeBatch creates atomic bundle, handle auth error. Mock @medplum/core MedplumClient. **Reference**: `research/06-fhir-lab-medplum.md` sections 4-5 for client API patterns.

- [x] T024 [P] [US1] Write result sender tests in `src/fhir/resultSender.test.ts`. Test cases: send LabResult → looks up Specimen by barcode → finds ServiceRequest → creates Observations + DiagReport via transaction bundle. Handle: barcode not found (log error, don't discard), Medplum unreachable (return error for queue). **Reference**: `research/06-fhir-lab-medplum.md` section 3 for barcode lookup. `research.md` Decision 9 for matching strategy.

### Implementation for User Story 1

- [x] T025 [P] [US1] Implement ASTM checksum calculator in `src/protocols/astm/checksum.ts`. Pure function: takes frame bytes between STX and ETX/ETB (exclusive), returns 2-char hex checksum. Algorithm: sum all bytes modulo 256, convert to uppercase hex. **Reference**: `research/01-astm-protocol.md` section 2.4 for exact algorithm.

- [x] T026 [P] [US1] Implement ASTM transport state machine in `src/protocols/astm/transport.ts`. States: idle, receiving, sending, error. Handle ENQ/ACK/NAK/STX/ETX/ETB/EOT. Emit parsed frames via EventEmitter. Validate checksums on received frames. Send ACK for good frames, NAK for bad. Respect timeout values (15s establishment, 30s between frames). Max 6 NAK retries. **Reference**: `research/01-astm-protocol.md` sections 2.1-2.10 for complete spec. Section 2.10 for state machine diagram.

- [x] T027 [P] [US1] Implement ASTM record parser in `src/protocols/astm/parser.ts`. Parse pipe-delimited ASTM records: H (header), P (patient), O (order — extract specimen barcode from field 3), R (result — extract test code, value, unit, reference range, abnormal flag), L (terminator). Assemble records into ASTMMessage structure. Handle multi-frame messages. **Reference**: `research/01-astm-protocol.md` sections 3.1-3.13 for field positions per record type. Existing `src/types/astm.ts` for type definitions.

- [x] T028 [P] [US1] Implement MLLP transport in `src/protocols/hl7v2/mllpTransport.ts`. Buffer incoming bytes, detect VT (0x0B) start, accumulate until FS+CR (0x1C + 0x0D), emit complete HL7 message string. Handle partial reads and multiple messages in one chunk. **Reference**: `research/02-hl7v2-protocol.md` section 1 for MLLP framing spec.

- [x] T029 [P] [US1] Implement HL7v2 ORU^R01 parser in `src/protocols/hl7v2/parser.ts`. Split message by CR (0x0D) into segments. Parse: MSH (field separator, sender, message type, version), PID (patient ID at PID.3, patient name at PID.5), OBR (order number, specimen ID), OBX (test code at OBX.3, value at OBX.5, unit at OBX.6, reference range at OBX.7, abnormal flag at OBX.8, result status at OBX.11). **Reference**: `research/02-hl7v2-protocol.md` sections 3-5 for field positions.

- [x] T030 [P] [US1] Implement HL7v2 ACK builder in `src/protocols/hl7v2/ack.ts`. Build MSH + MSA segments. MSA-1: AA (accept), AE (error), AR (reject). Copy MSH.10 (message control ID) from original to MSA.2. **Reference**: `research/02-hl7v2-protocol.md` section 6.

- [x] T031 [P] [US1] Implement Combilyzer parser in `src/protocols/combilyzer/parser.ts` + `src/protocols/combilyzer/parser.test.ts`. Parse the simplified proprietary format. Conservative parsing — log raw data on any parsing failure, don't crash. **Reference**: `research/01-astm-protocol.md` section 5.3 for Combilyzer-specific format details. Use `src/simulators/fixtures/combilyzer/urinalysis.txt`.

- [x] T032 [US1] Implement analyzer mapping registry in `src/mappers/analyzerMappings/index.ts`. Export function `getMappingForAnalyzer(analyzerId: string): AnalyzerMapping | null`. Registry maps analyzer IDs from config to their mapping files. **Reference**: `research.md` Decision 8.

- [x] T033 [P] [US1] Implement Sysmex XN-550 mappings in `src/mappers/analyzerMappings/sysmex-xn550.ts` + test. Map all 23 CBC parameters: WBC, RBC, HGB, HCT, MCV, MCH, MCHC, PLT, RDW-SD, RDW-CV, PDW, MPV, P-LCR, NEUT%, LYMPH%, MONO%, EO%, BASO%, NEUT#, LYMPH#, MONO#, EO#, BASO# → LOINC codes + display names + UCUM units. **Reference**: `research/03-hematology-analyzers.md` "Sysmex XN-550" section — contains the full mapping table with LOINC codes.

- [x] T034 [P] [US1] Implement Mindray BC-3510 mappings in `src/mappers/analyzerMappings/mindray-bc3510.ts`. Map 19 CBC parameters → LOINC codes. **Reference**: `research/03-hematology-analyzers.md` "Mindray BC-3510" section.

- [x] T035 [P] [US1] Implement Roche Cobas c111 mappings in `src/mappers/analyzerMappings/roche-cobas-c111.ts`. Map chemistry test codes (Glucose, BUN, Creatinine, ALT, AST, etc.) → LOINC. **Reference**: `research/04-chemistry-immunoassay-analyzers.md` "Roche Cobas c 111" section.

- [x] T036 [P] [US1] Implement Roche Cobas e411 mappings in `src/mappers/analyzerMappings/roche-cobas-e411.ts`. Map immunoassay test codes (TSH, FT4, FT3, Ferritin, etc.) → LOINC. **Reference**: `research/04-chemistry-immunoassay-analyzers.md` "Roche Cobas e 411" section.

- [x] T037 [P] [US1] Implement Roche Hitachi mappings in `src/mappers/analyzerMappings/roche-hitachi.ts`. Map chemistry codes → LOINC. **Reference**: `research/04-chemistry-immunoassay-analyzers.md` "Hitachi 917/7180" section.

- [x] T038 [P] [US1] Implement Bio-Rad D-10 mappings in `src/mappers/analyzerMappings/bio-rad-d10.ts`. Map HbA1c and hemoglobin variant codes → LOINC. **Reference**: `research/04-chemistry-immunoassay-analyzers.md` "Bio-Rad D-10" section.

- [x] T039 [P] [US1] Implement Tosoh AIA-360 mappings in `src/mappers/analyzerMappings/tosoh-aia360.ts`. Map immunoassay codes → LOINC. **Reference**: `research/04-chemistry-immunoassay-analyzers.md` "Tosoh AIA-360" section.

- [x] T040 [P] [US1] Implement Snibe Maglumi X3 mappings in `src/mappers/analyzerMappings/snibe-maglumi-x3.ts`. Map immunoassay codes → LOINC. **Reference**: `research/04-chemistry-immunoassay-analyzers.md` "Snibe Maglumi X3" section.

- [x] T041 [P] [US1] Implement Combilyzer 13 mappings in `src/mappers/analyzerMappings/combilyzer-13.ts`. Map urinalysis parameter codes → LOINC. **Reference**: `research/04-chemistry-immunoassay-analyzers.md` "Combilyzer 13" section if available, otherwise use standard urinalysis LOINC codes.

- [x] T042 [US1] Implement result mapper in `src/mappers/resultMapper.ts`. Convert ASTMMessage → LabResult[], HL7v2 ORU → LabResult[], Combilyzer output → LabResult[]. Apply analyzer mappings (LOINC codes, display names). Map abnormal flags (H/L/HH/LL/N/A). Extract specimen barcode. **Reference**: `data-model.md` entities LabResult + ComponentResult for output structure.

- [x] T043 [US1] Implement FHIR mapper in `src/mappers/fhirMapper.ts`. Convert LabResult → FHIR Observation[] + DiagnosticReport. Include: code.coding (MediMind + LOINC), valueQuantity (UCUM units), interpretation (v3-ObservationInterpretation), referenceRange (low/high), category=laboratory, status=preliminary. Add LIS extensions: lis-message-id, lis-imported=true, lis-import-time, lis-protocol, lis-barcode. **Reference**: `research/06-fhir-lab-medplum.md` sections 1-3 for resource templates. `data-model.md` "FHIR Resource Mapping" and "Abnormal Flag Mapping" tables. CLAUDE.md "LIS_EXTENSIONS" for extension URLs.

- [x] T044 [US1] Implement Medplum client wrapper in `src/fhir/medplumClient.ts`. Wrap @medplum/core MedplumClient. Functions: createClient(config), searchSpecimenByBarcode(barcode), searchServiceRequestBySpecimen(specimenId), createFHIRBundle(observations, diagnosticReport). Handle auth (client credentials flow), token refresh, retry on 429/503. **Reference**: `research/06-fhir-lab-medplum.md` sections 4-5 for MedplumClient API.

- [x] T045 [US1] Implement result sender in `src/fhir/resultSender.ts`. Orchestrate: receive LabResult → search Specimen by barcode → find ServiceRequest → build FHIR Observation[] + DiagReport → create via transaction bundle. Handle missing barcode (log, don't discard). Return success/error for queue decision. **Reference**: `research/06-fhir-lab-medplum.md` section 3 for barcode lookup. `research.md` Decision 5 for transaction bundles, Decision 9 for barcode matching.

**Checkpoint**: At this point, the core pipeline works — analyzer data goes in, FHIR resources come out. User Story 1 is independently testable.

---

## Phase 4: User Story 2 — Monitor Connection Status (Priority: P2)

**Goal**: REST API exposes `/health` and `/status` endpoints showing analyzer connection states and service health.

**Independent Test**: Query `GET /status` → see each analyzer's connected/disconnected state, message counts, error counts.

### Tests for User Story 2

- [x] T046 [P] [US2] Write serial connection wrapper tests in `src/connections/serialConnection.test.ts`. Test: open port (mock), close port, receive data events, handle open error (port busy), handle disconnection event. Use MockSerialPort from T002. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 1 for SerialPort API.

- [x] T047 [P] [US2] Write TCP connection wrapper tests in `src/connections/tcpConnection.test.ts`. Test: connect to TCP server (mock), disconnect, receive data, handle connection refused, handle connection timeout. Use Node.js net module mock. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 2 for TCP socket patterns.

- [x] T048 [P] [US2] Write connection manager tests in `src/connections/connectionManager.test.ts`. Test: start multiple connections from config, track per-analyzer status (connected/disconnected), update lastMessageTime on data, increment errorCount on errors, getStatus() returns correct AnalyzerStatus[]. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 3 for multi-connection patterns.

- [x] T049 [P] [US2] Write Express server tests in `src/api/server.test.ts` using supertest. Test: server starts on configured port, returns 404 for unknown routes, handles JSON errors, CORS headers present. **Reference**: `contracts/api.yaml` for endpoint definitions.

- [x] T050 [P] [US2] Write GET /health route tests in `src/api/routes/health.test.ts`. Test: returns status=ok when all good, status=degraded when analyzer disconnected, status=error when Medplum unreachable. Verify response matches `HealthResponse` schema from api.yaml. **Reference**: `contracts/api.yaml` HealthResponse schema.

- [x] T051 [P] [US2] Write GET /status route tests in `src/api/routes/status.test.ts`. Test: returns all analyzer statuses, includes correct fields per AnalyzerStatus schema, disabled analyzers show "Disabled in configuration". **Reference**: `contracts/api.yaml` StatusResponse schema.

### Implementation for User Story 2

- [x] T052 [US2] Implement serial connection wrapper in `src/connections/serialConnection.ts`. Wraps serialport library. Implements IConnection interface. Handles: open, close, write, data events, error events, disconnect detection. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 1.

- [x] T053 [P] [US2] Implement TCP connection wrapper in `src/connections/tcpConnection.ts`. Wraps net.Socket. Implements IConnection interface. Handles: connect, disconnect, data events, error events, connection timeout. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 2.

- [x] T054 [US2] Implement connection manager in `src/connections/connectionManager.ts`. Creates connections per analyzer config (serial or TCP). Tracks AnalyzerStatus per connection. Updates status on events (connect/disconnect/data/error). Exposes getStatuses(): AnalyzerStatus[]. Wires protocol drivers to connections. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 3.

- [x] T055 [US2] Implement Express server in `src/api/server.ts`. Create Express app, JSON body parser, CORS, error handling middleware, 404 handler. Export createServer(deps) function that accepts injected dependencies (connectionManager, messageLogger, queue). **Reference**: `contracts/api.yaml` for server definition.

- [x] T056 [P] [US2] Implement GET /health in `src/api/routes/health.ts`. Returns: status (ok/degraded/error), version, uptime (process.uptime()), timestamp, analyzer summary (total/connected/disconnected/disabled), queue counts, Medplum connectivity. **Reference**: `contracts/api.yaml` HealthResponse schema.

- [x] T057 [P] [US2] Implement GET /status in `src/api/routes/status.ts`. Returns AnalyzerStatus[] from connectionManager.getStatuses(). **Reference**: `contracts/api.yaml` StatusResponse schema.

**Checkpoint**: REST API works, analyzer connection states visible. US2 independently testable.

---

## Phase 5: User Story 3 — Handle Connection Failures Gracefully (Priority: P2)

**Goal**: Auto-reconnect to analyzers when connections drop. Queue results locally when Medplum is down. Zero data loss.

**Independent Test**: Disconnect a mock analyzer → verify reconnection attempts → reconnect → verify results flow again. Take Medplum mock offline → send results → verify they queue locally → bring Medplum back → verify queue drains.

### Tests for User Story 3

- [x] T058 [P] [US3] Write auto-reconnect tests for connection manager in `src/connections/connectionManager.test.ts` (extend existing test file). Test: on disconnect → starts reconnect timer, exponential backoff (1s→2s→4s→8s→16s→30s cap), reconnect succeeds → resets backoff, status updates during reconnect attempts. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 4, `research.md` Decision 7.

- [x] T059 [P] [US3] Write SQLite local queue tests in `src/queue/localQueue.test.ts`. Use in-memory SQLite (`:memory:`). Test: enqueue item, dequeue returns oldest pending, markSent removes from queue, markFailed increments attempts, getPendingCount, getFailedCount, items survive across operations (persistence proxy test), max retries respected. **Reference**: `data-model.md` "Entity: QueueEntry" for schema, "SQLite Schema" section for table definition. `research/05-nodejs-serial-tcp-patterns.md` section 6 for better-sqlite3 patterns.

- [x] T060 [P] [US3] Write retry processor tests in `src/queue/retryProcessor.test.ts`. Test: processes pending items in order, exponential backoff between retries, skips items not yet due, calls resultSender.send() for each item, marks sent on success, marks failed after max retries, stops processing when queue empty. **Reference**: `research.md` Decision 7 for backoff strategy.

### Implementation for User Story 3

- [x] T061 [US3] Add auto-reconnect logic to connection manager in `src/connections/connectionManager.ts` (extend). On connection close/error: start reconnect timer with exponential backoff (1s→2s→4s→8s→16s→30s max). On successful reconnect: reset backoff, update status. Re-wire protocol driver on reconnect. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 4 for reconnection pattern.

- [x] T062 [US3] Implement SQLite local queue in `src/queue/localQueue.ts`. Create `queue` table on init (from data-model.md schema). Functions: enqueue(labResult), dequeueNext(), markSent(id), markFailed(id, error), getPendingCount(), getFailedCount(), getNextRetryTime(). Use better-sqlite3 synchronous API. Enable WAL mode. **Reference**: `data-model.md` "SQLite Schema" for CREATE TABLE. `research/05-nodejs-serial-tcp-patterns.md` section 6 for better-sqlite3 API.

- [x] T063 [US3] Implement retry processor in `src/queue/retryProcessor.ts`. Runs on interval (from config retryIntervalMs). Dequeues pending items due for retry, calls resultSender.send(). On success: markSent. On failure: update nextRetryAt with exponential backoff. On max retries exceeded: markFailed. **Reference**: `research.md` Decision 7 for backoff strategy.

**Checkpoint**: Auto-reconnect works, offline queue buffers and retries. US3 independently testable.

---

## Phase 6: User Story 4 — Configure Analyzers Without Code Changes (Priority: P3)

**Goal**: Hospital IT edits analyzers.json → restart middleware → new analyzer connected. No code changes.

**Independent Test**: Add new analyzer entry to config → restart → verify it appears in /status.

### Implementation for User Story 4

- [x] T064 [US4] Verify configLoader handles dynamic analyzer additions (extend `src/config/configLoader.test.ts`). Add test: new analyzer in config → appears in getEnabledAnalyzers(). Removed analyzer → no longer in list. Changed port → reflected in config. Already mostly works via existing configLoader — this task verifies and adds edge case tests.

**Checkpoint**: Config-driven. US4 independently testable (mostly already works from Phase 1).

---

## Phase 7: User Story 5 — Message Logging and Audit Trail (Priority: P3)

**Goal**: Every message received from analyzers is logged with full raw content, parsed summary, FHIR resource IDs, and status.

**Independent Test**: Send a message → verify it appears in `GET /messages` with full content and correct status.

### Tests for User Story 5

- [x] T065 [P] [US5] Write message logger tests in `src/logging/messageLogger.test.ts`. Use in-memory SQLite. Test: log message with all fields, query by analyzerId, query by status, query by date range, pagination (limit/offset), count total, raw content preserved exactly, handle unicode/binary content. **Reference**: `data-model.md` "Entity: MessageLogEntry" for fields, "SQLite Schema" for table definition.

- [x] T066 [P] [US5] Write GET /messages route tests in `src/api/routes/messages.test.ts`. Test: returns paginated messages, filter by analyzerId, filter by status, filter by date range, single message by ID (GET /messages/:id), 404 for unknown ID. **Reference**: `contracts/api.yaml` MessagesResponse and MessageLogEntry schemas.

### Implementation for User Story 5

- [x] T067 [US5] Implement message logger in `src/logging/messageLogger.ts`. Create `message_log` table on init. Functions: logMessage(entry), queryMessages(filters), getMessageById(id), getCount(filters). Store raw content, parsed summary, FHIR resource IDs (JSON array), status. **Reference**: `data-model.md` "SQLite Schema" for CREATE TABLE. `research/05-nodejs-serial-tcp-patterns.md` section 6 for better-sqlite3 patterns.

- [x] T068 [US5] Implement GET /messages route in `src/api/routes/messages.ts`. Parse query params (limit, offset, analyzerId, status, from, to). Call messageLogger.queryMessages(). Return MessagesResponse format. Implement GET /messages/:id for single message detail. **Reference**: `contracts/api.yaml` /messages path definition.

**Checkpoint**: Full audit trail. US5 independently testable.

---

## Phase 8: Pipeline Orchestrator + Wiring

**Purpose**: Wire all components together into the result pipeline and entry point.

- [x] T069 [US1] Implement result pipeline orchestrator in `src/pipeline/resultPipeline.ts` + `src/pipeline/resultPipeline.test.ts`. Orchestrate: connection receives raw bytes → protocol driver parses → resultMapper converts to LabResult → messageLogger logs → fhirMapper builds FHIR → resultSender sends OR localQueue enqueues on failure. Emit PipelineEvents at each stage. Tests: full pipeline with mock dependencies, verify each stage called in order, error at any stage logs and continues. **Reference**: `plan.md` dependency map.

- [x] T070 Implement complete entry point in `src/index.ts` + test. Wire: loadConfig → create appLogger → create messageLogger → create localQueue → create medplumClient → create resultSender → create retryProcessor → create connectionManager (with protocol drivers) → create resultPipeline → create API server → start everything. Handle SIGINT/SIGTERM gracefully: close connections, flush queue, stop API, stop retry processor. **Reference**: existing `src/index.ts` skeleton.

---

## Phase 9: Simulators + Integration + E2E Tests

**Purpose**: Build test tools and verify the full pipeline end-to-end.

- [x] T071 [P] Implement ASTM simulator in `src/simulators/astmSimulator.ts`. Script that connects to a serial/TCP port and sends realistic ASTM frames (ENQ→STX→data→ETX→EOT). Uses fixture data. Configurable: which analyzer to simulate, how many results, delay between results. **Reference**: `research/01-astm-protocol.md` section 5.4 for recommended architecture.

- [x] T072 [P] Implement HL7v2 simulator in `src/simulators/hl7Simulator.ts`. Script that connects via TCP MLLP and sends ORU^R01 messages. Waits for ACK. Uses Mindray fixture data. **Reference**: `research/02-hl7v2-protocol.md` section 9 for Node.js implementation patterns.

- [x] T073 [P] Write ASTM pipeline integration test in `tests/integration/astm-pipeline.test.ts`. Full flow: MockSerialPort → ASTM transport → parser → resultMapper → fhirMapper → mock resultSender. Verify correct FHIR resources created from Sysmex CBC fixture. **Reference**: `src/simulators/fixtures/astm/sysmex-cbc.txt`.

- [x] T074 [P] Write HL7v2 pipeline integration test in `tests/integration/hl7v2-pipeline.test.ts`. Full flow: mock TCP → MLLP → HL7v2 parser → resultMapper → fhirMapper → mock resultSender. Verify correct FHIR resources from Mindray fixture. **Reference**: `src/simulators/fixtures/hl7v2/mindray-cbc.hl7`.

- [x] T075 [P] Write queue recovery integration test in `tests/integration/queue-recovery.test.ts`. Flow: send result → Medplum mock returns error → result queued → Medplum mock recovers → retry processor sends → verify result delivered. **Reference**: `research.md` Decision 4 for queue strategy.

- [x] T076 [P] Write multi-analyzer integration test in `tests/integration/multi-analyzer.test.ts`. Simulate 3+ analyzers sending results simultaneously via mock connections. Verify all results processed correctly, no race conditions, per-barcode sequential processing. **Reference**: spec.md edge case "two analyzers same barcode".

- [x] T077 Write E2E simulator-to-FHIR test in `tests/e2e/simulator-to-fhir.test.ts`. Start full middleware with mock Medplum. Run ASTM simulator → verify Observations + DiagReport created. Run HL7v2 simulator → verify same. **Reference**: `plan.md` Testing Strategy.

- [x] T078 Write E2E REST API test in `tests/e2e/api-status.test.ts`. Start full middleware. Query /health, /status, /messages. Verify correct responses. Send simulated result → verify /messages shows new entry. **Reference**: `contracts/api.yaml`.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass, Windows service, coverage verification.

- [x] T079 [P] Create `.env.example` file with all environment variable placeholders and comments. **Reference**: CLAUDE.md "Environment Variables" section.

- [x] T080 [P] Implement Windows Service install script in `scripts/install-windows-service.ts`. Use node-windows to install/uninstall as Windows Service with auto-restart on failure. **Reference**: `research/05-nodejs-serial-tcp-patterns.md` section 5 for node-windows patterns.

- [x] T081 [P] Configure ESLint in `eslint.config.js`. TypeScript strict rules, no-any, no-unused-vars. Run `npm run lint` and fix all issues. **Reference**: CLAUDE.md "Code Style" section.

- [x] T082 Run full test suite with coverage. Verify 100% coverage target met. Add any missing test cases for uncovered branches. Generate coverage report.

- [x] T083 Verify quickstart.md accuracy — walk through every step and ensure it works. Fix any outdated paths or commands.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)          ← No dependencies — start immediately
    ↓
Phase 2 (Foundational)   ← Depends on Phase 1
    ↓
Phase 3 (US1 - MVP)      ← Depends on Phase 2
Phase 4 (US2 - Status)   ← Depends on Phase 2 + T052-T054 from US2 need T008
Phase 5 (US3 - Failover) ← Depends on Phase 2 + US1's resultSender (T045)
Phase 6 (US4 - Config)   ← Depends on Phase 2 (trivial, mostly done)
Phase 7 (US5 - Logging)  ← Depends on Phase 2
    ↓
Phase 8 (Pipeline)        ← Depends on US1 + US2 + US3 + US5
Phase 9 (E2E Tests)       ← Depends on Phase 8
Phase 10 (Polish)         ← Depends on Phase 9
```

### User Story Independence

- **US1 (Core Pipeline)**: Foundation for everything. Tests and implementation can start immediately after Phase 2.
- **US2 (Monitoring)**: Independently buildable — needs connection layer + REST API. Can parallelize with US1.
- **US3 (Failover)**: Needs resultSender from US1, but queue/retry are independent. Can mostly parallelize with US1.
- **US4 (Config)**: Trivial — mostly already works. Quick verification.
- **US5 (Audit Trail)**: Fully independent — needs only SQLite + REST route. Can parallelize with US1.

### Parallel Agent Distribution (10 Agents)

**Wave 1 — Setup (7 agents parallel)**:
```
Agent 1: T001 (Vitest config)
Agent 2: T002 (MockSerialPort)
Agent 3: T003 (ASTM fixtures)
Agent 4: T004 (HL7v2 fixtures)
Agent 5: T005 (Combilyzer fixture)
Agent 6: T006 (configLoader tests)
Agent 7: T007 (Winston logger)
```

**Wave 2 — Foundational (7 agents parallel)**:
```
Agent 1: T008 (connection types)
Agent 2: T009 (HL7v2 types)
Agent 3: T010 (Combilyzer types)
Agent 4: T011 (Siemens stub)
Agent 5: T012 (mapping types)
Agent 6: T013 (FHIR types)
Agent 7: T014 (pipeline types)
```

**Wave 3 — US1 Tests (10 agents parallel!)**:
```
Agent 1:  T015 (ASTM checksum tests)
Agent 2:  T016 (ASTM transport tests)
Agent 3:  T017 (ASTM parser tests)
Agent 4:  T018 (MLLP transport tests)
Agent 5:  T019 (HL7v2 parser tests)
Agent 6:  T020 (ACK builder tests)
Agent 7:  T021 (result mapper tests)
Agent 8:  T022 (FHIR mapper tests)
Agent 9:  T023 (Medplum client tests)
Agent 10: T024 (result sender tests)
```

**Wave 4 — US1 Implementation + US2/US3/US5 Tests (10 agents parallel!)**:
```
Agent 1:  T025 (ASTM checksum impl)
Agent 2:  T026 (ASTM transport impl)
Agent 3:  T027 (ASTM parser impl)
Agent 4:  T028 (MLLP transport impl)
Agent 5:  T029 (HL7v2 parser impl)
Agent 6:  T030 (ACK builder impl)
Agent 7:  T031 (Combilyzer parser impl)
Agent 8:  T046-T048 (US2 connection tests)
Agent 9:  T058-T060 (US3 queue tests)
Agent 10: T065-T066 (US5 logger tests)
```

**Wave 5 — US1 Mappings (10 agents parallel!)**:
```
Agent 1:  T032 (mapping registry)
Agent 2:  T033 (Sysmex XN-550)
Agent 3:  T034 (Mindray BC-3510)
Agent 4:  T035 (Roche c111)
Agent 5:  T036 (Roche e411)
Agent 6:  T037 (Roche Hitachi)
Agent 7:  T038 (Bio-Rad D-10)
Agent 8:  T039 (Tosoh AIA-360)
Agent 9:  T040 (Snibe Maglumi X3)
Agent 10: T041 (Combilyzer 13)
```

**Wave 6 — US1 Mappers + US2/US3/US5 Implementation (10 agents)**:
```
Agent 1:  T042 (result mapper)
Agent 2:  T043 (FHIR mapper)
Agent 3:  T044 (Medplum client)
Agent 4:  T045 (result sender)
Agent 5:  T052 (serial connection)
Agent 6:  T053 (TCP connection)
Agent 7:  T054 (connection manager)
Agent 8:  T062 (local queue)
Agent 9:  T063 (retry processor)
Agent 10: T067 (message logger)
```

**Wave 7 — US2/US3/US5 Routes + API + Pipeline (8 agents)**:
```
Agent 1:  T055 (Express server)
Agent 2:  T056 (GET /health)
Agent 3:  T057 (GET /status)
Agent 4:  T068 (GET /messages)
Agent 5:  T061 (auto-reconnect)
Agent 6:  T064 (US4 config verification)
Agent 7:  T069 (pipeline orchestrator)
Agent 8:  T070 (entry point)
```

**Wave 8 — Simulators + Integration + E2E (8 agents)**:
```
Agent 1:  T071 (ASTM simulator)
Agent 2:  T072 (HL7v2 simulator)
Agent 3:  T073 (ASTM integration test)
Agent 4:  T074 (HL7v2 integration test)
Agent 5:  T075 (queue recovery test)
Agent 6:  T076 (multi-analyzer test)
Agent 7:  T077 (E2E simulator→FHIR)
Agent 8:  T078 (E2E REST API)
```

**Wave 9 — Polish (4 agents)**:
```
Agent 1:  T079 (.env.example)
Agent 2:  T080 (Windows service)
Agent 3:  T081 (ESLint config)
Agent 4:  T082-T083 (coverage + quickstart)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (Wave 1)
2. Complete Phase 2: Foundational (Wave 2)
3. Complete Phase 3: User Story 1 — Tests then Implementation (Waves 3-6)
4. **STOP and VALIDATE**: Run tests, verify FHIR resources created correctly
5. This alone is a working middleware that receives results and sends to Medplum

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test → **MVP deployed** (results flow from analyzers to Medplum)
3. Add User Story 2 → Test → Monitoring dashboard works in EMR
4. Add User Story 3 → Test → Resilient to failures, zero data loss
5. Add User Story 4 → Test → Hospital IT can configure analyzers
6. Add User Story 5 → Test → Full audit trail for debugging
7. Integration + E2E tests → Production confidence
8. Polish → Ship it

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 83 |
| Phase 1 (Setup) | 7 tasks — all parallel |
| Phase 2 (Foundational) | 7 tasks — all parallel |
| Phase 3 (US1 - MVP) | 31 tasks (10 tests + 21 impl) |
| Phase 4 (US2 - Status) | 12 tasks (6 tests + 6 impl) |
| Phase 5 (US3 - Failover) | 6 tasks (3 tests + 3 impl) |
| Phase 6 (US4 - Config) | 1 task |
| Phase 7 (US5 - Logging) | 4 tasks (2 tests + 2 impl) |
| Phase 8 (Pipeline) | 2 tasks |
| Phase 9 (E2E) | 8 tasks |
| Phase 10 (Polish) | 5 tasks |
| Max parallel agents per wave | 10 |
| Total waves for full build | 9 |
| Research files referenced | All 6 (every task points to its source) |
