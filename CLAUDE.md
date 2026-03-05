# CLAUDE.md — MediMind Lab Middleware

## Project Overview

**MediMind Lab Middleware** — A standalone Node.js/TypeScript service that receives laboratory test results from physical analyzers (blood chemistry, hematology, immunoassay machines) and forwards them as FHIR R4 resources to Medplum Cloud.

**Think of it as:** A translator that sits on a hospital lab PC, listens to lab machines speaking ASTM/HL7v2, and converts their results into FHIR data that MediMind EMR can display.

**Tech Stack:** TypeScript, Node.js, serialport (RS-232), node-hl7-server (HL7v2/MLLP), Express (REST API)

## Architecture

```
Physical Lab Analyzers (10 machines)
    │
    ├── ASTM E1394 over Serial/TCP (8 analyzers)
    ├── HL7v2 over MLLP/TCP (1 analyzer - Mindray)
    └── Siemens LIS3 proprietary (1 analyzer - RapidPoint 500e)
    │
    ▼
┌─────────────────────────────┐
│  This Middleware Service     │  ← Runs on a Windows PC in the lab
│                             │
│  ├── Protocol Drivers       │  ← Parse ASTM/HL7v2/LIS3
│  ├── Result Mapper          │  ← Convert to FHIR resources
│  ├── FHIR Sender            │  ← POST to Medplum Cloud
│  ├── Local Queue            │  ← Buffer when internet is down
│  ├── REST API               │  ← Status/monitoring for EMR
│  └── Message Logger         │  ← Audit trail
└─────────────────────────────┘
    │
    ▼ HTTPS
┌─────────────────────────────┐
│  Medplum Cloud              │  ← FHIR R4 server
│  (api.medplum.com)          │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  MediMind EMR (Browser)     │  ← Doctors & lab techs see results
└─────────────────────────────┘
```

## Target Analyzers

| Analyzer | Protocol | Connection | Default Baud |
|----------|----------|------------|-------------|
| Siemens RapidPoint 500e | Siemens LIS3 (proprietary) | Serial + Ethernet | Configurable |
| Mindray BC-3510 | HL7 v2.3.1 + ASTM | Serial (DB-9) | 9600 |
| Snibe Maglumi X3 | ASTM E1394 + HL7 | Serial + TCP/IP | Configurable |
| Combilyzer 13 | Proprietary serial | Serial only | 9600 |
| Roche Cobas c 111 | ASTM E1381/E1394 | Serial (DB-9) | 9600 |
| Roche Cobas e 411 | ASTM E1381/E1394 | Serial (DB-9) | 9600 |
| Roche Hitachi 917/7180 | ASTM E1381/E1394 | Serial | 9600 |
| Sysmex XN-550 | ASTM E1381-02/E1394-97 | Serial + Ethernet | 9600 |
| Bio-Rad D-10 | LIS1-A/LIS2-A (ASTM) | Serial (DB-9) | 9600 |
| Tosoh AIA-360 | ASTM | Serial | 9600 |

## Project Structure

```
src/
├── index.ts                    # Entry point — starts all services
├── config/
│   └── configLoader.ts         # Reads analyzers.json
│
├── protocols/
│   ├── astm/
│   │   ├── transport.ts        # ASTM E1381 low-level (ENQ/ACK/STX/ETX/EOT)
│   │   ├── parser.ts           # ASTM E1394 record parser (H/P/O/R/Q/L)
│   │   └── types.ts            # ASTM types
│   ├── hl7v2/
│   │   ├── listener.ts         # HL7v2 MLLP TCP listener
│   │   ├── parser.ts           # ORU^R01 message parser
│   │   └── types.ts            # HL7v2 types
│   └── siemens/
│       ├── lis3Driver.ts       # Siemens LIS3 proprietary protocol
│       └── types.ts            # LIS3 types
│
├── connections/
│   ├── serialConnection.ts     # RS-232 serial port manager
│   ├── tcpConnection.ts        # TCP/IP socket manager
│   └── connectionManager.ts    # Manages all analyzer connections
│
├── mappers/
│   ├── resultMapper.ts         # Raw results → standard ResultPayload
│   ├── fhirMapper.ts           # ResultPayload → FHIR Observation/DiagnosticReport
│   └── analyzerMappings/       # Per-analyzer field mappings
│       ├── sysmex-xn550.ts
│       ├── roche-cobas-c111.ts
│       └── ...
│
├── fhir/
│   └── medplumClient.ts        # Authenticated FHIR client for Medplum Cloud
│
├── queue/
│   ├── localQueue.ts           # SQLite-backed queue for offline buffering
│   └── retryProcessor.ts       # Processes queued items when online
│
├── api/
│   ├── server.ts               # Express REST API
│   └── routes/
│       ├── status.ts           # GET /status — analyzer connection states
│       ├── messages.ts         # GET /messages — message log
│       └── health.ts           # GET /health — service health check
│
├── logging/
│   └── messageLogger.ts        # Audit trail for all messages
│
└── types/
    ├── result.ts               # Standard result payload type
    ├── analyzer.ts             # Analyzer config types
    └── fhir.ts                 # FHIR resource types
```

## Development Commands

```bash
npm install                     # Install dependencies
npm run dev                     # Start with hot reload (development)
npm run build                   # Compile TypeScript
npm start                       # Run compiled version (production)
npm test                        # Run tests
npm run simulate                # Send simulated ASTM messages for testing
```

## Configuration

All analyzer settings live in `config/analyzers.json`:
```json
{
  "analyzers": [
    {
      "name": "Sysmex XN-550",
      "protocol": "astm",
      "connection": "serial",
      "port": "COM3",
      "baudRate": 9600,
      "dataBits": 8,
      "parity": "none",
      "stopBits": 1,
      "enabled": true
    }
  ],
  "medplum": {
    "baseUrl": "https://api.medplum.com",
    "projectId": "...",
    "clientId": "...",
    "clientSecret": "..."
  },
  "api": {
    "port": 3001
  }
}
```

## Key Conventions

### Code Style
- TypeScript strict mode, ESM modules
- Async/await everywhere (no callbacks)
- Error handling: never swallow errors, always log + report via status API
- Keep files small and focused (~100-200 lines max)

### Protocol Implementation Rules
- ALWAYS send ACK/NAK responses within timeout windows
- ALWAYS validate ASTM frame checksums before processing
- NEVER discard a message — log everything, even malformed ones
- ALWAYS buffer results locally before attempting to send to Medplum
- Serial port operations MUST handle "port busy" and "device disconnected" gracefully

### FHIR Resource Creation
- Use Medplum Client from `@medplum/core`
- Observation resources MUST include: code, value, unit, referenceRange, interpretation
- DiagnosticReport MUST reference all related Observations
- Link results to ServiceRequest via specimen barcode (Specimen.identifier)
- Extension base URL: `http://medimind.ge/fhir/StructureDefinition/`

### Testing
- Unit tests for protocol parsers (test with real message samples)
- Integration tests with simulated serial/TCP connections
- Use test fixtures from `tests/fixtures/` (real ASTM/HL7 message samples)

## Deployment

### As Windows Service
```bash
npm run build
npm run install-service    # Installs as Windows Service via node-windows
```

### As Docker Container
```bash
docker compose up -d
```
Note: Docker needs `--device` flag for serial port access on Linux. On Windows, use host networking.

## Environment Variables

```env
MEDPLUM_BASE_URL=https://api.medplum.com
MEDPLUM_CLIENT_ID=...
MEDPLUM_CLIENT_SECRET=...
LOG_LEVEL=info
LOG_DIR=./logs
QUEUE_DB_PATH=./data/queue.db
CONFIG_PATH=./config/analyzers.json
API_PORT=3001
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Serial port access denied | Run as Administrator, or add user to dialout group |
| Port already in use | Check if old Georgian LIS is still running on that COM port |
| Medplum auth fails | Verify client ID/secret in .env, check project ID |
| ASTM checksum errors | Verify baud rate matches analyzer settings |
| No data from analyzer | Check cable, verify analyzer is configured to send to host |

## Related Documentation

- Full spec: `/Users/toko/Desktop/medplum_medimind/specs/043-lab-middleware/spec.md`
- MediMind EMR lab module: `/Users/toko/Desktop/medplum_medimind/packages/app/src/emr/services/laboratory/`
- MediMind LIS adapter interface: `/Users/toko/Desktop/medplum_medimind/packages/app/src/emr/services/laboratory/lis/LISAdapter.ts`
- FHIR systems constants: `/Users/toko/Desktop/medplum_medimind/packages/app/src/emr/constants/fhir-systems.ts`

## Credentials

### Medplum Cloud
- **API URL:** `https://api.medplum.com/`
- **Project ID:** `71c7841a-7f47-4029-8ab4-0bf62751c173`
- **Client ID:** `c7d601b8-758f-4c90-b4dd-2fe8e1d66973`

## Agent Model Rule (CRITICAL)
- **ALWAYS use `model: "opus"` for ALL spawned agents** — no exceptions
