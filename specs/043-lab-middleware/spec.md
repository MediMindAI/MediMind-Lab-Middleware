# Feature Specification: MediMind Lab Middleware

**Feature Branch**: `043-lab-middleware`
**Created**: 2026-03-05
**Status**: Draft
**Input**: User description: "Build a standalone Node.js/TypeScript middleware service that runs on a hospital lab PC and receives laboratory test results from physical analyzers via ASTM and HL7v2 protocols, then forwards them as FHIR resources to Medplum Cloud. Replaces the current Georgian LIS software."

## Context & Background

The hospital currently uses a custom Georgian LIS (Laboratory Information System) that sits between physical lab analyzers and the old EMR. MediMind EMR already has a full lab module (Kanban queue, specimen tracking, barcodes, result polling, auto-verification, FHIR pipeline). The only missing piece is the "last mile" — a middleware service that physically talks to the analyzers and feeds results into MediMind.

**What this middleware does:** Receives test results from lab machines and sends them to the EMR.
**What this middleware does NOT do:** No UI, no result verification, no lab workflow management (MediMind handles all of that).

### Target Analyzers

| # | Analyzer | Manufacturer | Type | Protocol | Connection | Direction |
|---|----------|-------------|------|----------|------------|-----------|
| 1 | RapidPoint 500e | Siemens Healthineers | Blood Gas | Siemens LIS3 (proprietary) | Serial + Ethernet | Bidirectional |
| 2 | BC-3510 | Mindray | Hematology (CBC) | HL7 v2.3.1 + ASTM E1394 | Serial (DB-9) | Bidirectional |
| 3 | Maglumi X3 | Snibe | Immunoassay | ASTM E1394 + HL7 | Serial + TCP/IP | Bidirectional |
| 4 | Combilyzer 13 | 77 Elektronika / Human | Urinalysis | Proprietary serial (simplified ASTM-like) | Serial only | Unidirectional (results only) |
| 5 | Cobas c 111 | Roche | Clinical Chemistry | ASTM E1381/E1394 | Serial (DB-9) | Bidirectional |
| 6 | Cobas e 411 | Roche | Immunoassay | ASTM E1381/E1394 | Serial (DB-9) | Bidirectional |
| 7 | Hitachi (917/7180) | Roche/Hitachi | Chemistry | ASTM E1381/E1394 | Serial | Bidirectional |
| 8 | XN-550 | Sysmex | Hematology | ASTM E1381-02/E1394-97 | Serial + Ethernet | Bidirectional |
| 9 | D-10 | Bio-Rad | HbA1c / Hemoglobin | LIS1-A/LIS2-A (ASTM) | Serial (DB-9) | Bidirectional |
| 10 | AIA-360 | Tosoh | Immunoassay | ASTM | Serial only | Bidirectional |

**Protocol summary:** 8 of 10 analyzers use ASTM E1394. 1 uses proprietary Siemens LIS3. 1 uses simplified proprietary serial. All support RS-232 serial at 9600 baud 8-N-1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive Results Automatically from Analyzers (Priority: P1)

A lab technician places a blood sample into an analyzer (e.g., Sysmex XN-550). The machine runs the test and automatically sends results. The middleware receives these results, converts them to FHIR resources, and sends them to Medplum Cloud. Within seconds, the results appear in MediMind's lab module — the technician sees the Kanban card move from "In Progress" to "Resulted."

**Why this priority**: This is the core purpose of the middleware. Without this, nothing else matters.

**Independent Test**: Can be tested by sending a simulated ASTM result message to the middleware's listener port and verifying that a FHIR Observation + DiagnosticReport appear in Medplum Cloud.

**Acceptance Scenarios**:

1. **Given** the middleware is running and connected to a Sysmex XN-550, **When** the analyzer completes a CBC test and sends an ASTM ORU message, **Then** the middleware creates FHIR Observation resources for each result component (WBC, RBC, HGB, HCT, PLT, etc.) and a DiagnosticReport linking them, within 5 seconds.
2. **Given** the middleware receives results with abnormal flags (H, L, HH, LL), **When** the results are converted to FHIR, **Then** the Observation.interpretation field correctly reflects the abnormal status.
3. **Given** the analyzer sends results with a specimen barcode, **When** the middleware processes them, **Then** the results are linked to the correct patient and ServiceRequest via the barcode.

---

### User Story 2 - Monitor Connection Status (Priority: P2)

A lab supervisor wants to know that all analyzers are communicating correctly. The middleware provides a REST API endpoint that reports the connection status of each configured analyzer (connected, disconnected, last message time, error count). MediMind's existing LIS monitoring dashboard consumes this API.

**Why this priority**: Lab staff need confidence that the system is working. A "silent failure" where an analyzer disconnects and nobody notices is dangerous.

**Independent Test**: Can be tested by querying the REST API `/status` endpoint and verifying it returns correct connection states for each configured analyzer.

**Acceptance Scenarios**:

1. **Given** all analyzers are connected, **When** the status endpoint is called, **Then** each analyzer shows "connected" with a recent "lastMessageTime."
2. **Given** an analyzer's serial cable is unplugged, **When** the status endpoint is called, **Then** that analyzer shows "disconnected" and an alert timestamp.
3. **Given** an analyzer sends a malformed message, **When** the middleware processes it, **Then** the error is logged, the error count increments, and the status endpoint reflects the error.

---

### User Story 3 - Handle Connection Failures Gracefully (Priority: P2)

The lab PC reboots, or an analyzer loses connection temporarily. When things come back, the middleware automatically reconnects and resumes receiving results. No results are lost.

**Why this priority**: Hospital lab PCs are not datacenter servers. Power outages, Windows updates, and accidental cable disconnects happen regularly.

**Independent Test**: Can be tested by stopping the middleware, sending results from a simulator, restarting the middleware, and verifying that buffered results (if the analyzer buffers them) are received upon reconnection.

**Acceptance Scenarios**:

1. **Given** the middleware is running, **When** a serial connection drops, **Then** the middleware retries connection every 10 seconds until the analyzer responds.
2. **Given** the middleware was offline for 5 minutes, **When** it restarts, **Then** it reconnects to all configured analyzers and processes any buffered results the analyzers held.
3. **Given** the internet connection to Medplum Cloud is temporarily down, **When** results arrive from analyzers, **Then** the middleware queues them locally and sends them when connectivity is restored.

---

### User Story 4 - Configure Analyzers Without Code Changes (Priority: P3)

Hospital IT staff can add, remove, or reconfigure analyzers by editing a simple configuration file (JSON). No code recompilation needed.

**Why this priority**: Different hospitals have different analyzer setups. Adding a new machine should not require a developer.

**Independent Test**: Can be tested by adding a new analyzer entry to the config file, restarting the middleware, and verifying it starts listening for that analyzer.

**Acceptance Scenarios**:

1. **Given** a new Roche Cobas c111 is added to the lab, **When** hospital IT adds its configuration (name, protocol, connection type, port/COM number), **Then** the middleware connects to it on next restart.
2. **Given** an analyzer is removed from service, **When** its entry is removed from the config, **Then** the middleware stops trying to connect to it.

---

### User Story 5 - Message Logging and Audit Trail (Priority: P3)

All messages received from analyzers are logged with timestamps, raw content, and processing status. This enables debugging and provides an audit trail.

**Why this priority**: When a result doesn't appear in MediMind, the lab team needs to trace what happened — did the analyzer send it? Did the middleware parse it? Did it reach Medplum?

**Independent Test**: Can be tested by sending a result message and verifying it appears in the log file/database with full raw content and status.

**Acceptance Scenarios**:

1. **Given** the middleware receives an ASTM message, **When** processing completes, **Then** a log entry is created with: timestamp, analyzer name, raw message, parsed result summary, FHIR resource IDs created, and status (success/error).
2. **Given** a parsing error occurs, **When** the error is logged, **Then** the raw message is preserved in full for manual review.

---

### Edge Cases

- What happens when an analyzer sends a result for a barcode that doesn't exist in MediMind? (Log error, don't discard — allow manual matching later)
- What happens when two analyzers send results for the same barcode simultaneously? (Process sequentially per barcode, no race conditions)
- What happens when the middleware receives a corrupt/incomplete ASTM frame? (Send NAK, log the error, wait for retransmission)
- What happens when the Medplum Cloud API is rate-limited? (Queue locally, retry with exponential backoff)
- What happens when a serial port is already in use by another program? (Report clear error in status, don't crash)
- What happens during a Windows update reboot? (Windows Service restarts automatically after reboot)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST listen for incoming ASTM E1394/LIS2-A2 messages on configured serial ports and/or TCP ports
- **FR-002**: System MUST implement the ASTM E1381 low-level transport protocol (ENQ/ACK/NAK/STX/ETX/EOT handshake, frame checksums, retransmission on NAK)
- **FR-003**: System MUST parse ASTM record types: H (Header), P (Patient), O (Order), R (Result), Q (Query), L (Terminator)
- **FR-004**: System MUST support HL7v2 message reception over MLLP/TCP for analyzers that use HL7 (Mindray BC-3510)
- **FR-005**: System MUST parse HL7v2 ORU^R01 messages and extract result values from OBX segments
- **FR-006**: System MUST convert parsed results into FHIR R4 Observation and DiagnosticReport resources
- **FR-007**: System MUST send created FHIR resources to Medplum Cloud via HTTPS REST API
- **FR-008**: System MUST match incoming results to existing ServiceRequest/Specimen resources using specimen barcode
- **FR-009**: System MUST queue results locally when internet connectivity is lost and retry when connectivity is restored
- **FR-010**: System MUST automatically reconnect to analyzers when connections drop
- **FR-011**: System MUST expose a REST API for connection status, message logs, and health checks
- **FR-012**: System MUST read analyzer configuration from a JSON config file (no code changes to add/remove analyzers)
- **FR-013**: System MUST log all received messages with timestamps, raw content, and processing status
- **FR-014**: System MUST run as a Windows Service that starts automatically on boot
- **FR-015**: System MUST support both RS-232 serial connections (via serialport library) and TCP/IP connections
- **FR-016**: System MUST handle the Siemens LIS3 proprietary protocol for the RapidPoint 500e (separate driver)
- **FR-017**: System MUST handle abnormal result flags (H, L, HH, LL, N) and map them to FHIR Observation.interpretation
- **FR-018**: System MUST support concurrent connections to multiple analyzers simultaneously
- **FR-019**: System MUST process 3,000+ results per day without performance degradation

### Key Entities

- **Analyzer**: A physical lab machine identified by name, protocol, connection type, and address/port. Configured in JSON file.
- **Message**: A raw communication received from an analyzer (ASTM frame sequence or HL7v2 message). Stored for audit trail.
- **Result**: A parsed test result extracted from a message, containing: test code, value, unit, reference range, abnormal flag, specimen barcode.
- **FHIR Observation**: The standardized representation of a single test result, sent to Medplum Cloud.
- **FHIR DiagnosticReport**: Groups multiple Observations from the same test order, linked to the ServiceRequest.
- **Queue Entry**: A result that could not be sent to Medplum (connectivity issue) and is waiting for retry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Results from analyzers appear in MediMind within 10 seconds of the analyzer completing the test
- **SC-002**: System successfully processes 3,000+ results per day with zero data loss
- **SC-003**: System automatically recovers from connection failures within 30 seconds of connectivity being restored
- **SC-004**: No results are lost during internet outages of up to 24 hours (local queue holds them)
- **SC-005**: Hospital IT can add a new analyzer in under 10 minutes by editing the config file
- **SC-006**: System runs continuously for 30+ days without requiring manual restart
- **SC-007**: 100% of results sent by analyzers are either successfully delivered to Medplum or preserved in the error log for manual review
- **SC-008**: System supports all 10 target analyzers listed in the analyzer table

## Assumptions

- The hospital lab PC runs Windows 10/11 with at least 8GB RAM and has Node.js or Docker available
- Serial ports are accessible (either built-in RS-232 or USB-to-serial adapters)
- The hospital has internet connectivity to reach Medplum Cloud (api.medplum.com)
- Analyzer vendor interface specification documents will be obtained for exact message format details
- The middleware only needs to RECEIVE results (unidirectional from analyzer to middleware), not SEND orders to analyzers — order management is handled within MediMind
- The existing MediMind LIS adapter interface and result poller will consume the middleware's REST API
- Default serial settings are 9600 baud, 8-N-1 unless analyzer-specific documentation states otherwise
