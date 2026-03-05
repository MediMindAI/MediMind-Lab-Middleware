# Quickstart Guide: MediMind Lab Middleware

## Prerequisites

- Node.js 20+ installed
- Git
- A text editor (VS Code recommended)

No physical lab analyzers needed — we test everything with simulators.

## Setup

```bash
# Clone and install
git clone <repo-url>
cd medimind-lab-middleware
npm install

# Create .env file
cp .env.example .env
# Edit .env with your Medplum credentials
```

### .env File

```env
MEDPLUM_BASE_URL=https://api.medplum.com
MEDPLUM_CLIENT_ID=c7d601b8-758f-4c90-b4dd-2fe8e1d66973
MEDPLUM_CLIENT_SECRET=<your-secret-here>
MEDPLUM_PROJECT_ID=71c7841a-7f47-4029-8ab4-0bf62751c173
API_PORT=3001
LOG_LEVEL=info
LOG_DIR=./logs
QUEUE_DB_PATH=./data/queue.db
CONFIG_PATH=./config/analyzers.json
```

## Development

```bash
# Run in development mode (hot reload)
npm run dev

# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Type-check without building
npm run typecheck

# Lint
npm run lint

# Build for production
npm run build
npm start
```

## Testing with Simulators

The simulators pretend to be real lab analyzers. They send realistic ASTM/HL7v2 messages to the middleware.

```bash
# In terminal 1: Start the middleware
npm run dev

# In terminal 2: Send simulated ASTM results (like a Sysmex analyzer)
npm run simulate:astm

# In terminal 3: Send simulated HL7v2 results (like a Mindray analyzer)
npm run simulate:hl7
```

## Checking Results

### REST API

```bash
# Service health
curl http://localhost:3001/health

# Analyzer connection status
curl http://localhost:3001/status

# Message audit log (last 50)
curl http://localhost:3001/messages

# Messages from specific analyzer
curl http://localhost:3001/messages?analyzerId=sysmex-xn550

# Messages with errors
curl http://localhost:3001/messages?status=parse-error
```

### Medplum Cloud

After the middleware sends results, check Medplum:

```bash
# Search for recent Observations
curl -H "Authorization: Bearer <token>" \
  "https://api.medplum.com/fhir/R4/Observation?_sort=-_lastUpdated&_count=10"

# Search by specimen barcode
curl -H "Authorization: Bearer <token>" \
  "https://api.medplum.com/fhir/R4/Observation?specimen.identifier=12345678"
```

## Project Structure (Key Files)

```
src/
├── index.ts                 # Entry point — starts everything
├── config/configLoader.ts   # Reads analyzers.json
├── protocols/astm/          # ASTM protocol (8 analyzers)
├── protocols/hl7v2/         # HL7v2 protocol (Mindray)
├── connections/             # Serial + TCP connection management
├── mappers/                 # Test code → LOINC + FHIR mapping
├── fhir/                    # Medplum client + resource creation
├── queue/                   # Offline queue (SQLite)
├── api/                     # REST API (Express)
└── simulators/              # Test tools (fake analyzers)

config/analyzers.json        # Analyzer configuration
```

## Adding a New Analyzer

1. Add an entry to `config/analyzers.json`:
   ```json
   {
     "id": "new-analyzer",
     "name": "New Analyzer Model",
     "protocol": "astm",
     "connection": "serial",
     "port": "COM12",
     "baudRate": 9600,
     "dataBits": 8,
     "parity": "none",
     "stopBits": 1,
     "enabled": true
   }
   ```

2. Create a mapping file in `src/mappers/analyzerMappings/new-analyzer.ts`

3. Register it in `src/mappers/analyzerMappings/index.ts`

4. Restart the middleware

## Hospital Deployment

```bash
# Build
npm run build

# Install as Windows Service (auto-starts on boot)
npm run install-service

# Check service status
sc query MediMindLabMiddleware

# Remove Windows Service
npm run uninstall-service
```
