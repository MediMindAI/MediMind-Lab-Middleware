# Research: FHIR R4 Lab Result Patterns & Medplum Client

**Date**: 2026-03-05
**Status**: Complete
**Confidence**: 90% -- based on official FHIR R4 spec, Medplum docs, and verified patterns from the existing MediMind EMR codebase.

## Research Question

What are the correct FHIR R4 resource structures, Medplum client patterns, and implementation details needed to convert lab analyzer results into FHIR Observation + DiagnosticReport resources and send them to Medplum Cloud?

## TL;DR

The middleware creates one FHIR Observation per test component (e.g., WBC, RBC, HGB) and one DiagnosticReport to group them. Resources are linked to existing ServiceRequest/Specimen via the 8-digit specimen barcode. The Medplum `@medplum/core` client provides `createResource()`, `searchOne()`, `searchResources()`, and `executeBatch()` for atomic transaction bundles. All patterns are verified against the existing MediMind EMR codebase (`labResultService.ts`, `diagnosticReportService.ts`).

---

## 1. FHIR Observation for Lab Results

An Observation is a single measured value -- think of it as one row on a lab report (e.g., "WBC = 7.5 x10^3/uL"). Each test component the analyzer sends becomes one Observation resource.

### 1.1 Resource Structure

| Field | Cardinality | Description |
|-------|-------------|-------------|
| `resourceType` | 1..1 | Always `"Observation"` |
| `status` | 1..1 | `registered` / `preliminary` / `final` / `amended` / `corrected` / `cancelled` / `entered-in-error` |
| `category` | 1..* | Must include `laboratory` from observation-category |
| `code` | 1..1 | What was measured -- LOINC code + display |
| `subject` | 1..1 | Reference to Patient |
| `encounter` | 0..1 | Reference to Encounter (optional) |
| `effectiveDateTime` | 0..1 | When the test was performed on the specimen |
| `issued` | 0..1 | When the result was made available (middleware receipt time) |
| `performer` | 0..* | Who/what performed the test (Device or Organization) |
| `valueQuantity` | 0..1 | Numeric result with value, unit, UCUM code |
| `valueString` | 0..1 | Non-numeric result (e.g., "Positive", "Reactive") |
| `interpretation` | 0..* | Abnormal flag (H, L, HH, LL, N, A) |
| `referenceRange` | 0..* | Normal range (low, high) |
| `specimen` | 0..1 | Reference to Specimen resource |
| `basedOn` | 0..* | Reference to ServiceRequest (the lab order) |
| `extension` | 0..* | MediMind LIS extensions (imported flag, message ID, etc.) |
| `note` | 0..* | Free-text notes |

### 1.2 Status Values

From the middleware's perspective, these are the relevant statuses:

| Status | When to Use |
|--------|------------|
| `preliminary` | Result received from analyzer but not yet verified by lab tech in MediMind |
| `final` | Result has been verified (set by EMR, not middleware) |
| `corrected` | Analyzer sent an amended/corrected result for a previously final result |
| `cancelled` | Result was cancelled (rare from analyzers) |

**Middleware default**: Always send as `preliminary` -- the EMR handles verification workflow and promotes to `final`.

Exception: If the analyzer explicitly marks a result as "final" (some do via ASTM result status field), send as `final`.

### 1.3 Category

Every lab Observation must include this category. This is how FHIR systems distinguish lab results from vitals, imaging, etc.

```json
{
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "laboratory",
          "display": "Laboratory"
        }
      ],
      "text": "Laboratory"
    }
  ]
}
```

### 1.4 Code (What Was Measured)

The `code` field identifies what test was performed. We use dual coding: the MediMind internal lab test code system + LOINC (when available).

```json
{
  "code": {
    "coding": [
      {
        "system": "http://medimind.ge/fhir/CodeSystem/lab-tests",
        "code": "WBC",
        "display": "White Blood Cell Count"
      },
      {
        "system": "http://loinc.org",
        "code": "6690-2",
        "display": "Leukocytes [#/volume] in Blood by Automated count"
      }
    ],
    "text": "White Blood Cell Count"
  }
}
```

**Important**: The first coding uses the MediMind internal code system (`http://medimind.ge/fhir/CodeSystem/lab-tests`) because that is what the EMR's lab module uses for matching. LOINC is secondary and used for interoperability.

### 1.5 Value (The Result)

#### Numeric Results (most common)

```json
{
  "valueQuantity": {
    "value": 7.5,
    "unit": "10*3/uL",
    "system": "http://unitsofmeasure.org",
    "code": "10*3/uL"
  }
}
```

Key rules:
- `value` is a decimal number (not a string)
- `unit` is the human-readable display unit
- `system` is always `http://unitsofmeasure.org` (UCUM)
- `code` is the UCUM-encoded unit (see Section 8 for mapping table)

#### Non-Numeric Results

For qualitative results (e.g., blood type, culture results):

```json
{
  "valueString": "Positive"
}
```

Or for coded values:

```json
{
  "valueCodeableConcept": {
    "coding": [
      {
        "system": "http://snomed.info/sct",
        "code": "10828004",
        "display": "Positive"
      }
    ],
    "text": "Positive"
  }
}
```

### 1.6 Reference Range

The analyzer typically sends reference ranges as text (e.g., "4.5-11.0"). We parse them into structured low/high values.

```json
{
  "referenceRange": [
    {
      "low": {
        "value": 4.5,
        "unit": "10*3/uL",
        "system": "http://unitsofmeasure.org",
        "code": "10*3/uL"
      },
      "high": {
        "value": 11.0,
        "unit": "10*3/uL",
        "system": "http://unitsofmeasure.org",
        "code": "10*3/uL"
      },
      "text": "4.5 - 11.0"
    }
  ]
}
```

**Parsing rules for the middleware**:
- If the analyzer sends "4.5-11.0" -> parse into `low: 4.5`, `high: 11.0`
- If the analyzer sends "<10" -> only set `high: 10`
- If the analyzer sends ">100" -> only set `low: 100`
- If parsing fails -> set `text` with the raw string, leave `low`/`high` empty

### 1.7 Complete Observation Example (WBC)

```json
{
  "resourceType": "Observation",
  "status": "preliminary",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "laboratory",
          "display": "Laboratory"
        }
      ],
      "text": "Laboratory"
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://medimind.ge/fhir/CodeSystem/lab-tests",
        "code": "WBC",
        "display": "White Blood Cell Count"
      },
      {
        "system": "http://loinc.org",
        "code": "6690-2",
        "display": "Leukocytes [#/volume] in Blood by Automated count"
      }
    ],
    "text": "White Blood Cell Count"
  },
  "subject": {
    "reference": "Patient/abc-123-def"
  },
  "effectiveDateTime": "2026-03-05T10:30:00+04:00",
  "issued": "2026-03-05T10:30:05+04:00",
  "performer": [
    {
      "reference": "Device/sysmex-xn550",
      "display": "Sysmex XN-550"
    }
  ],
  "basedOn": [
    {
      "reference": "ServiceRequest/order-456"
    }
  ],
  "specimen": {
    "reference": "Specimen/specimen-789"
  },
  "valueQuantity": {
    "value": 7.5,
    "unit": "10*3/uL",
    "system": "http://unitsofmeasure.org",
    "code": "10*3/uL"
  },
  "referenceRange": [
    {
      "low": {
        "value": 4.5,
        "unit": "10*3/uL",
        "system": "http://unitsofmeasure.org",
        "code": "10*3/uL"
      },
      "high": {
        "value": 11.0,
        "unit": "10*3/uL",
        "system": "http://unitsofmeasure.org",
        "code": "10*3/uL"
      }
    }
  ],
  "interpretation": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
          "code": "N",
          "display": "Normal"
        }
      ],
      "text": "Normal"
    }
  ],
  "extension": [
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-imported",
      "valueBoolean": true
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-import-time",
      "valueDateTime": "2026-03-05T10:30:05+04:00"
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-message-id",
      "valueString": "MSG-20260305-001"
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-protocol",
      "valueString": "astm"
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-barcode",
      "valueString": "14829365"
    }
  ]
}
```

---

## 2. Observation Interpretation (Abnormal Flags)

Analyzers send abnormal flags with each result component. These map directly to the FHIR `v3-ObservationInterpretation` code system.

### 2.1 Code System

- **System URL**: `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation`
- **Value Set**: `http://hl7.org/fhir/ValueSet/observation-interpretation`

### 2.2 Flag Mapping Table

| Analyzer Flag | FHIR Code | Display | Description |
|---------------|-----------|---------|-------------|
| `N` or empty | `N` | Normal | Within reference range |
| `L` | `L` | Low | Below lower reference range limit |
| `H` | `H` | High | Above upper reference range limit |
| `LL` | `LL` | Critical low | Below critical low -- immediate action needed |
| `HH` | `HH` | Critical high | Above critical high -- immediate action needed |
| `A` | `A` | Abnormal | Outside reference range (direction unknown) |
| (not used) | `AA` | Critical abnormal | Critical level, direction unknown |

### 2.3 Building the Interpretation Field

```typescript
import type { Observation } from '@medplum/fhirtypes';
import type { ResultFlag } from '../types/result';

const INTERPRETATION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

const INTERPRETATION_DISPLAY: Record<string, string> = {
  N: 'Normal',
  L: 'Low',
  H: 'High',
  LL: 'Critical low',
  HH: 'Critical high',
  A: 'Abnormal',
};

function buildInterpretation(flag: ResultFlag): Observation['interpretation'] {
  // No flag or empty string -> no interpretation field
  if (!flag) return undefined;

  const display = INTERPRETATION_DISPLAY[flag] || flag;

  return [
    {
      coding: [
        {
          system: INTERPRETATION_SYSTEM,
          code: flag,
          display,
        },
      ],
      text: display,
    },
  ];
}
```

### 2.4 Confirmed by MediMind EMR

The existing EMR codebase (`labResultService.ts:256-263`, `resultValidation.ts:63-96`) uses exactly this system URL and the same codes (N, H, L, HH, LL). The middleware must match this exactly so the EMR can display and process the results correctly.

---

## 3. FHIR DiagnosticReport for Lab Panels

A DiagnosticReport is the "envelope" that groups all Observations from one test order. Think of it as the lab report cover sheet -- it says "CBC Panel for Patient X" and lists all the individual results (WBC, RBC, HGB, etc.).

### 3.1 Resource Structure

| Field | Cardinality | Description |
|-------|-------------|-------------|
| `resourceType` | 1..1 | Always `"DiagnosticReport"` |
| `status` | 1..1 | `registered` / `partial` / `preliminary` / `final` / `amended` / `corrected` / `appended` / `cancelled` / `entered-in-error` |
| `category` | 1..* | `LAB` from diagnostic-service-sections (v2-0074) |
| `code` | 1..1 | The panel/test code (e.g., CBC Panel) |
| `subject` | 1..1 | Reference to Patient |
| `effectiveDateTime` | 0..1 | When tests were performed |
| `issued` | 0..1 | When report was created/sent |
| `result` | 0..* | References to all Observation resources |
| `basedOn` | 0..* | Reference to ServiceRequest |
| `specimen` | 0..* | Reference to Specimen |
| `performer` | 0..* | Who produced the report |
| `extension` | 0..* | MediMind LIS extensions |

### 3.2 Status Logic (from EMR codebase)

The existing MediMind EMR (`diagnosticReportService.ts:132-141`) uses this smart status logic:

| Condition | Status |
|-----------|--------|
| 0 result Observations created | `registered` |
| Some results but fewer than expected | `partial` |
| All expected results received | `preliminary` |
| Verified by lab tech (EMR action) | `final` |

**Middleware approach**: Since the middleware sends all results at once (after parsing a complete ASTM message), the status should be `preliminary` -- meaning "all results are in, awaiting human verification."

### 3.3 Category

DiagnosticReport uses a different category system than Observation. It uses the HL7 v2 diagnostic service sections:

```json
{
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
          "code": "LAB",
          "display": "Laboratory"
        }
      ]
    }
  ]
}
```

### 3.4 Complete DiagnosticReport Example (CBC Panel)

```json
{
  "resourceType": "DiagnosticReport",
  "status": "preliminary",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
          "code": "LAB",
          "display": "Laboratory"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://medimind.ge/fhir/CodeSystem/lab-tests",
        "code": "CBC",
        "display": "Complete Blood Count"
      },
      {
        "system": "http://loinc.org",
        "code": "58410-2",
        "display": "CBC panel - Blood by Automated count"
      }
    ],
    "text": "Complete Blood Count"
  },
  "subject": {
    "reference": "Patient/abc-123-def"
  },
  "effectiveDateTime": "2026-03-05T10:30:00+04:00",
  "issued": "2026-03-05T10:30:05+04:00",
  "basedOn": [
    {
      "reference": "ServiceRequest/order-456"
    }
  ],
  "specimen": [
    {
      "reference": "Specimen/specimen-789"
    }
  ],
  "result": [
    { "reference": "Observation/obs-wbc-001" },
    { "reference": "Observation/obs-rbc-002" },
    { "reference": "Observation/obs-hgb-003" },
    { "reference": "Observation/obs-hct-004" },
    { "reference": "Observation/obs-plt-005" },
    { "reference": "Observation/obs-mcv-006" },
    { "reference": "Observation/obs-mch-007" },
    { "reference": "Observation/obs-mchc-008" }
  ],
  "performer": [
    {
      "reference": "Device/sysmex-xn550",
      "display": "Sysmex XN-550"
    }
  ],
  "extension": [
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-imported",
      "valueBoolean": true
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-import-time",
      "valueDateTime": "2026-03-05T10:30:05+04:00"
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-message-id",
      "valueString": "MSG-20260305-001"
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-protocol",
      "valueString": "astm"
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-transmission-status",
      "valueString": "received"
    },
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/lis-transmission-time",
      "valueDateTime": "2026-03-05T10:30:05+04:00"
    }
  ]
}
```

---

## 4. Linking Results to Orders via Barcode

The barcode is the bridge between the physical lab world and the digital FHIR world. When a lab tech scans a tube into an analyzer, the analyzer includes that barcode in its result message. The middleware uses this barcode to find the matching order in MediMind.

### 4.1 How Barcodes Are Stored in MediMind

From the existing EMR codebase (`labOrderService.ts:419-422`):

**ServiceRequest** has the barcode in two places:
1. As an `identifier` (for FHIR search): `{ system: "http://medimind.ge/fhir/identifier/lab-barcode", value: "14829365" }`
2. As an `extension` (for direct access): `{ url: "http://medimind.ge/fhir/StructureDefinition/lis-barcode", valueString: "14829365" }`

**Specimen** is linked to the ServiceRequest via `Specimen.request` (a reference to the ServiceRequest). The specimen itself may also have a barcode identifier using the system `http://medimind.ge/fhir/identifier/specimen-barcode`.

### 4.2 Searching by Barcode

The middleware needs to find the ServiceRequest that matches a given barcode. Here is the search pattern:

```typescript
// Find the ServiceRequest by barcode
const serviceRequest = await medplum.searchOne('ServiceRequest', {
  identifier: 'http://medimind.ge/fhir/identifier/lab-barcode|14829365',
});

if (!serviceRequest) {
  // Barcode not found in MediMind -- log error, queue for manual matching
  throw new Error(`No ServiceRequest found for barcode: 14829365`);
}

// Extract the Patient reference
const patientRef = serviceRequest.subject?.reference;
// e.g., "Patient/abc-123-def"

// Find the Specimen linked to this order
const specimens = await medplum.searchResources('Specimen', {
  request: `ServiceRequest/${serviceRequest.id}`,
  _count: '1',
});
const specimen = specimens[0]; // May be undefined if not yet collected
```

### 4.3 FHIR Search API Patterns

| Search | API Call |
|--------|----------|
| Find order by barcode | `GET /fhir/R4/ServiceRequest?identifier=http://medimind.ge/fhir/identifier/lab-barcode\|14829365` |
| Find specimen by order | `GET /fhir/R4/Specimen?request=ServiceRequest/order-456` |
| Find existing results | `GET /fhir/R4/Observation?based-on=ServiceRequest/order-456&category=laboratory` |
| Find existing report | `GET /fhir/R4/DiagnosticReport?based-on=ServiceRequest/order-456` |

### 4.4 What If the Barcode Is Not Found?

Per the spec edge cases: "Log error, don't discard -- allow manual matching later." The middleware should:

1. Save the result to the local queue with status `unmatched`
2. Log a warning with the barcode and all result data
3. Expose the unmatched result via the REST API `/messages` endpoint
4. The EMR can later try to match it manually

---

## 5. Medplum TypeScript Client (`@medplum/core`)

The middleware uses `@medplum/core` v4.x (currently installed). Here is everything needed to interact with Medplum Cloud.

### 5.1 Initialization and Authentication

The middleware uses **client credentials** authentication (machine-to-machine, no human login).

```typescript
import { MedplumClient } from '@medplum/core';

// Initialize the client
const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
});

// Authenticate with client credentials
// This is a one-time call; the client handles token refresh internally
await medplum.startClientLogin(
  'c7d601b8-758f-4c90-b4dd-2fe8e1d66973',  // clientId
  'your-client-secret-here'                   // clientSecret
);

// Verify authentication worked
if (medplum.getActiveLogin()) {
  console.log('Authenticated to Medplum Cloud');
}
```

**Important notes**:
- `startClientLogin()` handles OAuth2 token exchange internally
- The client automatically refreshes tokens before they expire
- No need to manually manage access tokens
- The `baseUrl` must end with a trailing slash

### 5.2 Creating Resources

```typescript
import type { Observation, DiagnosticReport } from '@medplum/fhirtypes';

// Create a single Observation
const createdObs = await medplum.createResource<Observation>({
  resourceType: 'Observation',
  status: 'preliminary',
  // ... all fields
});

console.log(`Created Observation/${createdObs.id}`);

// Create a DiagnosticReport
const report = await medplum.createResource<DiagnosticReport>({
  resourceType: 'DiagnosticReport',
  status: 'preliminary',
  result: [
    { reference: `Observation/${createdObs.id}` },
  ],
  // ... all fields
});
```

### 5.3 Searching Resources

```typescript
// searchOne: returns a single resource or undefined
const serviceRequest = await medplum.searchOne('ServiceRequest', {
  identifier: 'http://medimind.ge/fhir/identifier/lab-barcode|14829365',
});

// searchResources: returns an array of resources
const observations = await medplum.searchResources('Observation', {
  'based-on': `ServiceRequest/${orderId}`,
  category: 'laboratory',
  _count: '100',
});

// search: returns a Bundle (lower-level, includes metadata like total count)
const bundle = await medplum.search('ServiceRequest', {
  identifier: `http://medimind.ge/fhir/identifier/lab-barcode|${barcode}`,
  _count: '1',
  _summary: 'count',
});
const total = bundle.total ?? 0;
```

### 5.4 Updating Resources

```typescript
// Update an existing resource (must include id)
const updated = await medplum.updateResource({
  ...existingReport,
  status: 'preliminary',
  result: observationRefs,
});
```

### 5.5 Reading a Resource by ID

```typescript
const patient = await medplum.readResource('Patient', 'abc-123-def');
const specimen = await medplum.readResource('Specimen', 'specimen-789');
```

### 5.6 Error Handling

```typescript
import { OperationOutcomeError } from '@medplum/core';

try {
  const result = await medplum.createResource(observation);
} catch (error) {
  if (error instanceof OperationOutcomeError) {
    // FHIR OperationOutcome error -- server rejected the resource
    console.error('FHIR error:', error.outcome.issue?.[0]?.diagnostics);
  } else if (error instanceof Error) {
    // Network or other error
    console.error('Network error:', error.message);
  }
}
```

---

## 6. FHIR Transaction Bundle

Instead of creating Observations one-by-one and then a DiagnosticReport, we can send everything in a single atomic transaction. This is critical for data consistency -- either all resources are created or none are.

### 6.1 Why Transaction Bundles?

- **Atomicity**: All-or-nothing. No orphaned Observations without a DiagnosticReport.
- **Performance**: One HTTP request instead of N+1 (N observations + 1 report).
- **Cross-referencing**: Observations and DiagnosticReport can reference each other using temporary IDs (`urn:uuid:`) before they get real server IDs.

### 6.2 Bundle Structure

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:<temporary-id>",
      "resource": { /* the FHIR resource */ },
      "request": {
        "method": "POST",
        "url": "<ResourceType>"
      }
    }
  ]
}
```

Key rules:
- `type` must be `"transaction"` (not `"batch"`) for atomicity
- Each entry needs a `request` with `method: "POST"` and `url: "<ResourceType>"`
- Use `fullUrl: "urn:uuid:<uuid>"` as temporary IDs
- Other entries can reference the temp ID: `{ "reference": "urn:uuid:<same-uuid>" }`
- The server replaces all `urn:uuid:` references with real IDs after creation

### 6.3 Complete Transaction Bundle Example (CBC with 3 Observations)

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:obs-wbc-001",
      "resource": {
        "resourceType": "Observation",
        "status": "preliminary",
        "category": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "laboratory",
                "display": "Laboratory"
              }
            ]
          }
        ],
        "code": {
          "coding": [
            {
              "system": "http://medimind.ge/fhir/CodeSystem/lab-tests",
              "code": "WBC",
              "display": "White Blood Cell Count"
            },
            {
              "system": "http://loinc.org",
              "code": "6690-2",
              "display": "Leukocytes [#/volume] in Blood by Automated count"
            }
          ],
          "text": "White Blood Cell Count"
        },
        "subject": { "reference": "Patient/abc-123-def" },
        "effectiveDateTime": "2026-03-05T10:30:00+04:00",
        "issued": "2026-03-05T10:30:05+04:00",
        "basedOn": [{ "reference": "ServiceRequest/order-456" }],
        "specimen": { "reference": "Specimen/specimen-789" },
        "valueQuantity": {
          "value": 7.5,
          "unit": "10*3/uL",
          "system": "http://unitsofmeasure.org",
          "code": "10*3/uL"
        },
        "referenceRange": [
          {
            "low": { "value": 4.5, "unit": "10*3/uL", "system": "http://unitsofmeasure.org", "code": "10*3/uL" },
            "high": { "value": 11.0, "unit": "10*3/uL", "system": "http://unitsofmeasure.org", "code": "10*3/uL" }
          }
        ],
        "interpretation": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                "code": "N",
                "display": "Normal"
              }
            ],
            "text": "Normal"
          }
        ],
        "extension": [
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-imported", "valueBoolean": true },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-import-time", "valueDateTime": "2026-03-05T10:30:05+04:00" },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-message-id", "valueString": "MSG-20260305-001" },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-protocol", "valueString": "astm" }
        ]
      },
      "request": { "method": "POST", "url": "Observation" }
    },
    {
      "fullUrl": "urn:uuid:obs-rbc-002",
      "resource": {
        "resourceType": "Observation",
        "status": "preliminary",
        "category": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "laboratory",
                "display": "Laboratory"
              }
            ]
          }
        ],
        "code": {
          "coding": [
            { "system": "http://medimind.ge/fhir/CodeSystem/lab-tests", "code": "RBC", "display": "Red Blood Cell Count" },
            { "system": "http://loinc.org", "code": "789-8", "display": "Erythrocytes [#/volume] in Blood by Automated count" }
          ],
          "text": "Red Blood Cell Count"
        },
        "subject": { "reference": "Patient/abc-123-def" },
        "effectiveDateTime": "2026-03-05T10:30:00+04:00",
        "basedOn": [{ "reference": "ServiceRequest/order-456" }],
        "specimen": { "reference": "Specimen/specimen-789" },
        "valueQuantity": { "value": 4.85, "unit": "10*6/uL", "system": "http://unitsofmeasure.org", "code": "10*6/uL" },
        "referenceRange": [
          {
            "low": { "value": 4.5, "unit": "10*6/uL", "system": "http://unitsofmeasure.org", "code": "10*6/uL" },
            "high": { "value": 5.5, "unit": "10*6/uL", "system": "http://unitsofmeasure.org", "code": "10*6/uL" }
          }
        ],
        "interpretation": [
          { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", "code": "N", "display": "Normal" }], "text": "Normal" }
        ],
        "extension": [
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-imported", "valueBoolean": true },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-message-id", "valueString": "MSG-20260305-001" }
        ]
      },
      "request": { "method": "POST", "url": "Observation" }
    },
    {
      "fullUrl": "urn:uuid:obs-hgb-003",
      "resource": {
        "resourceType": "Observation",
        "status": "preliminary",
        "category": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "laboratory",
                "display": "Laboratory"
              }
            ]
          }
        ],
        "code": {
          "coding": [
            { "system": "http://medimind.ge/fhir/CodeSystem/lab-tests", "code": "HGB", "display": "Hemoglobin" },
            { "system": "http://loinc.org", "code": "718-7", "display": "Hemoglobin [Mass/volume] in Blood" }
          ],
          "text": "Hemoglobin"
        },
        "subject": { "reference": "Patient/abc-123-def" },
        "effectiveDateTime": "2026-03-05T10:30:00+04:00",
        "basedOn": [{ "reference": "ServiceRequest/order-456" }],
        "specimen": { "reference": "Specimen/specimen-789" },
        "valueQuantity": { "value": 13.2, "unit": "g/dL", "system": "http://unitsofmeasure.org", "code": "g/dL" },
        "referenceRange": [
          {
            "low": { "value": 12.0, "unit": "g/dL", "system": "http://unitsofmeasure.org", "code": "g/dL" },
            "high": { "value": 16.0, "unit": "g/dL", "system": "http://unitsofmeasure.org", "code": "g/dL" }
          }
        ],
        "interpretation": [
          { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", "code": "N", "display": "Normal" }], "text": "Normal" }
        ],
        "extension": [
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-imported", "valueBoolean": true },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-message-id", "valueString": "MSG-20260305-001" }
        ]
      },
      "request": { "method": "POST", "url": "Observation" }
    },
    {
      "fullUrl": "urn:uuid:report-001",
      "resource": {
        "resourceType": "DiagnosticReport",
        "status": "preliminary",
        "category": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                "code": "LAB",
                "display": "Laboratory"
              }
            ]
          }
        ],
        "code": {
          "coding": [
            { "system": "http://medimind.ge/fhir/CodeSystem/lab-tests", "code": "CBC", "display": "Complete Blood Count" },
            { "system": "http://loinc.org", "code": "58410-2", "display": "CBC panel - Blood by Automated count" }
          ],
          "text": "Complete Blood Count"
        },
        "subject": { "reference": "Patient/abc-123-def" },
        "effectiveDateTime": "2026-03-05T10:30:00+04:00",
        "issued": "2026-03-05T10:30:05+04:00",
        "basedOn": [{ "reference": "ServiceRequest/order-456" }],
        "specimen": [{ "reference": "Specimen/specimen-789" }],
        "result": [
          { "reference": "urn:uuid:obs-wbc-001" },
          { "reference": "urn:uuid:obs-rbc-002" },
          { "reference": "urn:uuid:obs-hgb-003" }
        ],
        "extension": [
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-imported", "valueBoolean": true },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-import-time", "valueDateTime": "2026-03-05T10:30:05+04:00" },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-message-id", "valueString": "MSG-20260305-001" },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-transmission-status", "valueString": "received" },
          { "url": "http://medimind.ge/fhir/StructureDefinition/lis-transmission-time", "valueDateTime": "2026-03-05T10:30:05+04:00" }
        ]
      },
      "request": { "method": "POST", "url": "DiagnosticReport" }
    }
  ]
}
```

**Key point**: The DiagnosticReport's `result` array uses `urn:uuid:obs-wbc-001` etc. to reference the Observations defined earlier in the same bundle. Medplum resolves these to real server IDs after creation.

### 6.4 Sending the Transaction via Medplum Client

```typescript
import { MedplumClient } from '@medplum/core';
import type { Bundle } from '@medplum/fhirtypes';

async function sendLabResults(
  medplum: MedplumClient,
  bundle: Bundle
): Promise<Bundle> {
  // executeBatch sends the transaction to POST /fhir/R4
  const response = await medplum.executeBatch(bundle);

  // Check each entry in the response for errors
  for (const entry of response.entry || []) {
    const status = entry.response?.status;
    if (status && !status.startsWith('2')) {
      // HTTP status 4xx or 5xx -- this entry failed
      console.error(
        `Failed to create resource: ${status}`,
        entry.response?.outcome
      );
      throw new Error(`Transaction entry failed with status: ${status}`);
    }
  }

  return response;
}
```

### 6.5 Extracting Created Resource IDs from Response

After a successful transaction, the response bundle contains the server-assigned IDs:

```typescript
function extractCreatedIds(response: Bundle): {
  observationIds: string[];
  diagnosticReportId: string | undefined;
} {
  const observationIds: string[] = [];
  let diagnosticReportId: string | undefined;

  for (const entry of response.entry || []) {
    // response.location is like "Observation/abc-123/_history/1"
    const location = entry.response?.location;
    if (!location) continue;

    if (location.startsWith('Observation/')) {
      const id = location.split('/')[1];
      observationIds.push(id);
    } else if (location.startsWith('DiagnosticReport/')) {
      diagnosticReportId = location.split('/')[1];
    }
  }

  return { observationIds, diagnosticReportId };
}
```

---

## 7. MediMind Extension URLs

These extensions are custom metadata that the MediMind EMR uses to track LIS integration details. They are defined in the EMR codebase at `fhir-systems.ts` under `LIS_EXTENSIONS`.

### 7.1 Extension Reference Table

| Extension URL | Value Type | Description | Used On |
|---------------|-----------|-------------|---------|
| `http://medimind.ge/fhir/StructureDefinition/lis-imported` | `valueBoolean` | Whether this result was imported from a LIS/analyzer (always `true` for middleware) | Observation |
| `http://medimind.ge/fhir/StructureDefinition/lis-import-time` | `valueDateTime` | When the middleware received and processed this result | Observation, DiagnosticReport |
| `http://medimind.ge/fhir/StructureDefinition/lis-message-id` | `valueString` | Unique message ID for audit trail tracking | Observation, DiagnosticReport |
| `http://medimind.ge/fhir/StructureDefinition/lis-protocol` | `valueString` | Communication protocol used (`astm`, `hl7v2`, `siemens-lis3`) | Observation, DiagnosticReport |
| `http://medimind.ge/fhir/StructureDefinition/lis-transmission-status` | `valueString` | Transmission status (`received`, `sent`, `error`) | DiagnosticReport, ServiceRequest |
| `http://medimind.ge/fhir/StructureDefinition/lis-transmission-time` | `valueDateTime` | When the result was transmitted/received | DiagnosticReport, ServiceRequest |
| `http://medimind.ge/fhir/StructureDefinition/lis-barcode` | `valueString` | The 8-digit specimen barcode | ServiceRequest (set by EMR) |

### 7.2 How to Add Extensions to a Resource

Extensions are just an array on the resource. Here is a TypeScript helper:

```typescript
import type { Extension } from '@medplum/fhirtypes';

// Extension URL constants (must match EMR exactly)
const LIS_EXTENSIONS = {
  IMPORTED: 'http://medimind.ge/fhir/StructureDefinition/lis-imported',
  IMPORT_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-import-time',
  MESSAGE_ID: 'http://medimind.ge/fhir/StructureDefinition/lis-message-id',
  PROTOCOL: 'http://medimind.ge/fhir/StructureDefinition/lis-protocol',
  TRANSMISSION_STATUS: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-status',
  TRANSMISSION_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-time',
  BARCODE: 'http://medimind.ge/fhir/StructureDefinition/lis-barcode',
} as const;

/**
 * Build the standard LIS extensions for an Observation created by the middleware.
 */
function buildObservationExtensions(params: {
  messageId: string;
  protocol: string;
  receivedAt: string;
}): Extension[] {
  return [
    {
      url: LIS_EXTENSIONS.IMPORTED,
      valueBoolean: true,
    },
    {
      url: LIS_EXTENSIONS.IMPORT_TIME,
      valueDateTime: params.receivedAt,
    },
    {
      url: LIS_EXTENSIONS.MESSAGE_ID,
      valueString: params.messageId,
    },
    {
      url: LIS_EXTENSIONS.PROTOCOL,
      valueString: params.protocol,
    },
  ];
}

/**
 * Build the standard LIS extensions for a DiagnosticReport created by the middleware.
 */
function buildReportExtensions(params: {
  messageId: string;
  protocol: string;
  receivedAt: string;
}): Extension[] {
  return [
    {
      url: LIS_EXTENSIONS.IMPORTED,
      valueBoolean: true,
    },
    {
      url: LIS_EXTENSIONS.IMPORT_TIME,
      valueDateTime: params.receivedAt,
    },
    {
      url: LIS_EXTENSIONS.MESSAGE_ID,
      valueString: params.messageId,
    },
    {
      url: LIS_EXTENSIONS.TRANSMISSION_STATUS,
      valueString: 'received',
    },
    {
      url: LIS_EXTENSIONS.TRANSMISSION_TIME,
      valueDateTime: params.receivedAt,
    },
  ];
}
```

### 7.3 Extension Value Types Summary

| Value Type | FHIR Property | Example |
|-----------|--------------|---------|
| Boolean | `valueBoolean` | `true` / `false` |
| DateTime | `valueDateTime` | `"2026-03-05T10:30:05+04:00"` |
| String | `valueString` | `"MSG-20260305-001"` |
| Code | `valueCode` | `"astm"` (also works as valueString) |

---

## 8. UCUM Units

UCUM (Unified Code for Units of Measure) is the standard unit system used in FHIR. The system URL is always `http://unitsofmeasure.org`.

### 8.1 Common Lab Unit Mapping Table

This maps the human-readable units that analyzers typically send to their correct UCUM codes.

| Human-Readable Unit | UCUM Code | Used For | Notes |
|---------------------|-----------|----------|-------|
| x10^3/uL | `10*3/uL` | WBC, Platelets | Thousands per microliter |
| x10^6/uL | `10*6/uL` | RBC | Millions per microliter |
| x10^9/L | `10*9/L` | WBC (SI) | Giga per liter (SI equivalent of 10^3/uL) |
| x10^12/L | `10*12/L` | RBC (SI) | Tera per liter (SI equivalent of 10^6/uL) |
| g/dL | `g/dL` | Hemoglobin, Total Protein | Grams per deciliter |
| g/L | `g/L` | Hemoglobin (SI) | Grams per liter |
| mg/dL | `mg/dL` | Glucose, BUN, Creatinine, Cholesterol | Milligrams per deciliter |
| mg/L | `mg/L` | CRP | Milligrams per liter |
| mmol/L | `mmol/L` | Electrolytes (Na, K, Cl), Glucose (SI) | Millimoles per liter |
| mEq/L | `meq/L` | Electrolytes (older style) | Milliequivalents per liter |
| U/L | `U/L` | Liver enzymes (ALT, AST, ALP, GGT) | Units per liter |
| IU/L | `[IU]/L` | Some immunoassays | International units per liter |
| IU/mL | `[IU]/mL` | Hepatitis, HIV viral loads | International units per milliliter |
| mIU/mL | `m[IU]/mL` | TSH, hCG | Milli-international units per mL |
| uIU/mL | `u[IU]/mL` | Insulin | Micro-international units per mL |
| ng/mL | `ng/mL` | PSA, Vitamin D, Ferritin | Nanograms per milliliter |
| ng/dL | `ng/dL` | Testosterone, Free T4 | Nanograms per deciliter |
| pg/mL | `pg/mL` | Vitamin B12 | Picograms per milliliter |
| ug/dL | `ug/dL` | Iron, Cortisol | Micrograms per deciliter |
| % | `%` | Hematocrit, HbA1c, Eosinophils % | Percentage |
| fL | `fL` | MCV | Femtoliters |
| pg | `pg` | MCH | Picograms |
| g/dL | `g/dL` | MCHC | Grams per deciliter |
| mm/hr | `mm/h` | ESR | Millimeters per hour |
| sec | `s` | PT, aPTT | Seconds |
| ratio | `{ratio}` | INR | Dimensionless ratio |
| pH | `[pH]` | Blood gas pH | pH units |
| mmHg | `mm[Hg]` | Blood gas pO2, pCO2 | Millimeters of mercury |
| cells/uL | `/uL` | Absolute cell counts | Per microliter |
| copies/mL | `{copies}/mL` | Viral load | Copies per milliliter |

### 8.2 TypeScript Unit Mapping Helper

```typescript
/**
 * Maps common analyzer unit strings to UCUM codes.
 * Analyzers send units in various formats -- this normalizes them.
 */
const UCUM_MAP: Record<string, string> = {
  // Hematology
  'x10^3/uL': '10*3/uL',
  '10^3/uL': '10*3/uL',
  '10*3/uL': '10*3/uL',
  'K/uL': '10*3/uL',
  'x10^6/uL': '10*6/uL',
  '10^6/uL': '10*6/uL',
  '10*6/uL': '10*6/uL',
  'M/uL': '10*6/uL',
  'x10^9/L': '10*9/L',
  '10^9/L': '10*9/L',
  'x10^12/L': '10*12/L',
  '10^12/L': '10*12/L',

  // Mass concentrations
  'g/dL': 'g/dL',
  'g/dl': 'g/dL',
  'g/L': 'g/L',
  'mg/dL': 'mg/dL',
  'mg/dl': 'mg/dL',
  'mg/L': 'mg/L',
  'ug/dL': 'ug/dL',
  'ug/dl': 'ug/dL',
  'ng/mL': 'ng/mL',
  'ng/ml': 'ng/mL',
  'ng/dL': 'ng/dL',
  'ng/dl': 'ng/dL',
  'pg/mL': 'pg/mL',
  'pg/ml': 'pg/mL',

  // Molar concentrations
  'mmol/L': 'mmol/L',
  'mmol/l': 'mmol/L',
  'umol/L': 'umol/L',
  'umol/l': 'umol/L',
  'mEq/L': 'meq/L',
  'meq/L': 'meq/L',

  // Enzyme activity
  'U/L': 'U/L',
  'u/L': 'U/L',
  'IU/L': '[IU]/L',
  'IU/mL': '[IU]/mL',
  'mIU/mL': 'm[IU]/mL',
  'mIU/ml': 'm[IU]/mL',
  'uIU/mL': 'u[IU]/mL',

  // Other
  '%': '%',
  'fL': 'fL',
  'fl': 'fL',
  'pg': 'pg',
  'sec': 's',
  'seconds': 's',
  's': 's',
  'mm/hr': 'mm/h',
  'mm/h': 'mm/h',
  'ratio': '{ratio}',
  'pH': '[pH]',
  'mmHg': 'mm[Hg]',
  '/uL': '/uL',
  'cells/uL': '/uL',
  'copies/mL': '{copies}/mL',
};

/**
 * Convert an analyzer unit string to a UCUM code.
 * Returns the original string if no mapping is found.
 */
function toUcumCode(analyzerUnit: string): string {
  return UCUM_MAP[analyzerUnit] || UCUM_MAP[analyzerUnit.trim()] || analyzerUnit;
}
```

---

## 9. Complete TypeScript Implementation: Building the Transaction Bundle

This is the core function that takes a `LabResult` (from the protocol parsers) and builds a FHIR transaction bundle ready to send to Medplum.

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { Bundle, BundleEntry, Observation, DiagnosticReport, Extension } from '@medplum/fhirtypes';
import type { LabResult, ComponentResult, ResultFlag } from '../types/result';

// --- Constants ---

const OBSERVATION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
const DIAGNOSTIC_SERVICE_SECTION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0074';
const INTERPRETATION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';
const LOINC_SYSTEM = 'http://loinc.org';
const UCUM_SYSTEM = 'http://unitsofmeasure.org';
const LAB_TESTS_SYSTEM = 'http://medimind.ge/fhir/CodeSystem/lab-tests';

const LIS_EXT = {
  IMPORTED: 'http://medimind.ge/fhir/StructureDefinition/lis-imported',
  IMPORT_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-import-time',
  MESSAGE_ID: 'http://medimind.ge/fhir/StructureDefinition/lis-message-id',
  PROTOCOL: 'http://medimind.ge/fhir/StructureDefinition/lis-protocol',
  TRANSMISSION_STATUS: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-status',
  TRANSMISSION_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-time',
} as const;

const INTERPRETATION_DISPLAY: Record<string, string> = {
  N: 'Normal',
  L: 'Low',
  H: 'High',
  LL: 'Critical low',
  HH: 'Critical high',
  A: 'Abnormal',
};

// --- Types for resolved order context ---

interface OrderContext {
  serviceRequestId: string;
  serviceRequestRef: string;
  patientRef: string;
  specimenId?: string;
  specimenRef?: string;
  testCode?: string;
  testName?: string;
}

// --- Build Functions ---

function buildObservationExtensions(
  messageId: string,
  protocol: string,
  receivedAt: string
): Extension[] {
  return [
    { url: LIS_EXT.IMPORTED, valueBoolean: true },
    { url: LIS_EXT.IMPORT_TIME, valueDateTime: receivedAt },
    { url: LIS_EXT.MESSAGE_ID, valueString: messageId },
    { url: LIS_EXT.PROTOCOL, valueString: protocol },
  ];
}

function buildReportExtensions(
  messageId: string,
  receivedAt: string
): Extension[] {
  return [
    { url: LIS_EXT.IMPORTED, valueBoolean: true },
    { url: LIS_EXT.IMPORT_TIME, valueDateTime: receivedAt },
    { url: LIS_EXT.MESSAGE_ID, valueString: messageId },
    { url: LIS_EXT.TRANSMISSION_STATUS, valueString: 'received' },
    { url: LIS_EXT.TRANSMISSION_TIME, valueDateTime: receivedAt },
  ];
}

function parseReferenceRange(rangeStr: string): { low?: number; high?: number } {
  // Try "low-high" format (e.g., "4.5-11.0")
  const dashMatch = rangeStr.match(/^([\d.]+)\s*[-\u2013]\s*([\d.]+)$/);
  if (dashMatch) {
    return { low: parseFloat(dashMatch[1]), high: parseFloat(dashMatch[2]) };
  }
  // Try "<value" format
  const ltMatch = rangeStr.match(/^[<]\s*([\d.]+)$/);
  if (ltMatch) {
    return { high: parseFloat(ltMatch[1]) };
  }
  // Try ">value" format
  const gtMatch = rangeStr.match(/^[>]\s*([\d.]+)$/);
  if (gtMatch) {
    return { low: parseFloat(gtMatch[1]) };
  }
  return {};
}

function buildObservation(
  component: ComponentResult,
  context: OrderContext,
  labResult: LabResult,
  protocol: string
): { observation: Observation; tempId: string } {
  const tempId = `urn:uuid:${uuidv4()}`;
  const ucumCode = toUcumCode(component.unit);
  const numericValue = parseFloat(component.value);
  const isNumeric = !isNaN(numericValue) && isFinite(numericValue);
  const range = parseReferenceRange(component.referenceRange);

  const observation: Observation = {
    resourceType: 'Observation',
    status: component.status === 'final' ? 'final' : 'preliminary',
    category: [
      {
        coding: [
          {
            system: OBSERVATION_CATEGORY_SYSTEM,
            code: 'laboratory',
            display: 'Laboratory',
          },
        ],
        text: 'Laboratory',
      },
    ],
    code: {
      coding: [
        {
          system: LAB_TESTS_SYSTEM,
          code: component.testCode,
          display: component.testName,
        },
      ],
      text: component.testName,
    },
    subject: { reference: context.patientRef },
    effectiveDateTime: labResult.testDateTime || labResult.receivedAt,
    issued: labResult.receivedAt,
    basedOn: [{ reference: context.serviceRequestRef }],
    extension: buildObservationExtensions(
      labResult.messageId,
      protocol,
      labResult.receivedAt
    ),
  };

  // Add specimen reference if available
  if (context.specimenRef) {
    observation.specimen = { reference: context.specimenRef };
  }

  // Add value (numeric or string)
  if (isNumeric) {
    observation.valueQuantity = {
      value: numericValue,
      unit: component.unit,
      system: UCUM_SYSTEM,
      code: ucumCode,
    };
  } else {
    observation.valueString = component.value;
  }

  // Add reference range (only for numeric values)
  if (isNumeric && (range.low !== undefined || range.high !== undefined)) {
    observation.referenceRange = [
      {
        ...(range.low !== undefined && {
          low: { value: range.low, unit: component.unit, system: UCUM_SYSTEM, code: ucumCode },
        }),
        ...(range.high !== undefined && {
          high: { value: range.high, unit: component.unit, system: UCUM_SYSTEM, code: ucumCode },
        }),
        ...(component.referenceRange && { text: component.referenceRange }),
      },
    ];
  }

  // Add interpretation (abnormal flag)
  if (component.flag) {
    const display = INTERPRETATION_DISPLAY[component.flag] || component.flag;
    observation.interpretation = [
      {
        coding: [
          {
            system: INTERPRETATION_SYSTEM,
            code: component.flag,
            display,
          },
        ],
        text: display,
      },
    ];
  }

  return { observation, tempId };
}

/**
 * Build a FHIR transaction bundle from a parsed LabResult.
 *
 * @param labResult - The parsed result from a protocol driver
 * @param context - The resolved order context (ServiceRequest, Patient, Specimen)
 * @param protocol - The protocol name (astm, hl7v2, siemens-lis3)
 * @returns A FHIR Bundle ready to send via medplum.executeBatch()
 */
function buildLabResultBundle(
  labResult: LabResult,
  context: OrderContext,
  protocol: string
): Bundle {
  const entries: BundleEntry[] = [];
  const observationTempIds: string[] = [];

  // 1. Create an entry for each component result -> Observation
  for (const component of labResult.components) {
    const { observation, tempId } = buildObservation(
      component,
      context,
      labResult,
      protocol
    );

    entries.push({
      fullUrl: tempId,
      resource: observation,
      request: { method: 'POST', url: 'Observation' },
    });

    observationTempIds.push(tempId);
  }

  // 2. Create the DiagnosticReport that references all Observations
  const report: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    status: 'preliminary',
    category: [
      {
        coding: [
          {
            system: DIAGNOSTIC_SERVICE_SECTION_SYSTEM,
            code: 'LAB',
            display: 'Laboratory',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: LAB_TESTS_SYSTEM,
          code: context.testCode || 'LAB',
          display: context.testName || 'Laboratory Report',
        },
      ],
      text: context.testName || 'Laboratory Report',
    },
    subject: { reference: context.patientRef },
    effectiveDateTime: labResult.testDateTime || labResult.receivedAt,
    issued: labResult.receivedAt,
    basedOn: [{ reference: context.serviceRequestRef }],
    result: observationTempIds.map((id) => ({ reference: id })),
    extension: buildReportExtensions(labResult.messageId, labResult.receivedAt),
  };

  if (context.specimenRef) {
    report.specimen = [{ reference: context.specimenRef }];
  }

  entries.push({
    fullUrl: `urn:uuid:${uuidv4()}`,
    resource: report,
    request: { method: 'POST', url: 'DiagnosticReport' },
  });

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  };
}
```

---

## 10. Complete End-to-End Flow: From LabResult to Medplum

This is the full orchestration function that the middleware calls after parsing a lab result.

```typescript
import { MedplumClient, OperationOutcomeError } from '@medplum/core';
import type { Bundle, ServiceRequest, Specimen } from '@medplum/fhirtypes';
import type { LabResult } from '../types/result';

const LAB_BARCODE_SYSTEM = 'http://medimind.ge/fhir/identifier/lab-barcode';

/**
 * Process a parsed LabResult: find the matching order, build FHIR resources,
 * and send them to Medplum Cloud.
 *
 * Returns the IDs of created resources, or throws on failure.
 */
async function processLabResult(
  medplum: MedplumClient,
  labResult: LabResult,
  protocol: string
): Promise<{ observationIds: string[]; diagnosticReportId: string }> {

  // Step 1: Find the ServiceRequest by barcode
  const serviceRequest = await medplum.searchOne('ServiceRequest', {
    identifier: `${LAB_BARCODE_SYSTEM}|${labResult.specimenBarcode}`,
  });

  if (!serviceRequest) {
    throw new Error(
      `No ServiceRequest found for barcode: ${labResult.specimenBarcode}`
    );
  }

  const patientRef = serviceRequest.subject?.reference;
  if (!patientRef) {
    throw new Error(
      `ServiceRequest/${serviceRequest.id} has no patient reference`
    );
  }

  // Step 2: Find the Specimen (optional -- may not exist yet)
  let specimen: Specimen | undefined;
  try {
    const specimens = await medplum.searchResources('Specimen', {
      request: `ServiceRequest/${serviceRequest.id}`,
      _count: '1',
    });
    specimen = specimens[0];
  } catch {
    // Specimen not found -- continue without it
  }

  // Step 3: Build the order context
  const context: OrderContext = {
    serviceRequestId: serviceRequest.id!,
    serviceRequestRef: `ServiceRequest/${serviceRequest.id}`,
    patientRef,
    specimenId: specimen?.id,
    specimenRef: specimen ? `Specimen/${specimen.id}` : undefined,
    testCode: serviceRequest.code?.coding?.[0]?.code,
    testName: serviceRequest.code?.coding?.[0]?.display || serviceRequest.code?.text,
  };

  // Step 4: Build the FHIR transaction bundle
  const bundle = buildLabResultBundle(labResult, context, protocol);

  // Step 5: Send to Medplum
  const response = await medplum.executeBatch(bundle);

  // Step 6: Extract created resource IDs
  const { observationIds, diagnosticReportId } = extractCreatedIds(response);

  if (!diagnosticReportId) {
    throw new Error('DiagnosticReport was not created in the transaction');
  }

  return { observationIds, diagnosticReportId };
}
```

---

## 11. FHIR System URL Quick Reference

All system URLs used by the middleware in one place:

| Purpose | URL |
|---------|-----|
| **Observation category** | `http://terminology.hl7.org/CodeSystem/observation-category` |
| **DiagnosticReport category** | `http://terminology.hl7.org/CodeSystem/v2-0074` |
| **Interpretation codes** | `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation` |
| **LOINC codes** | `http://loinc.org` |
| **UCUM units** | `http://unitsofmeasure.org` |
| **SNOMED CT** | `http://snomed.info/sct` |
| **MediMind lab tests** | `http://medimind.ge/fhir/CodeSystem/lab-tests` |
| **MediMind lab panels** | `http://medimind.ge/fhir/CodeSystem/lab-panels` |
| **MediMind lab components** | `http://medimind.ge/fhir/CodeSystem/lab-components` |
| **MediMind lab barcode ID** | `http://medimind.ge/fhir/identifier/lab-barcode` |
| **MediMind specimen barcode ID** | `http://medimind.ge/fhir/identifier/specimen-barcode` |
| **MediMind base URL** | `http://medimind.ge/fhir` |

---

## 12. Common LOINC Codes for Analyzer Tests

Reference table of common lab tests and their LOINC codes. These will be used in the per-analyzer mapping files.

### CBC (Complete Blood Count) -- Sysmex XN-550, Mindray BC-3510

| Test | LOINC Code | LOINC Display | Unit |
|------|-----------|---------------|------|
| WBC | 6690-2 | Leukocytes [#/volume] in Blood by Automated count | 10*3/uL |
| RBC | 789-8 | Erythrocytes [#/volume] in Blood by Automated count | 10*6/uL |
| HGB | 718-7 | Hemoglobin [Mass/volume] in Blood | g/dL |
| HCT | 4544-3 | Hematocrit [Volume Fraction] of Blood by Automated count | % |
| PLT | 777-3 | Platelets [#/volume] in Blood by Automated count | 10*3/uL |
| MCV | 787-2 | MCV [Entitic volume] by Automated count | fL |
| MCH | 785-6 | MCH [Entitic mass] by Automated count | pg |
| MCHC | 786-4 | MCHC [Mass/volume] by Automated count | g/dL |
| RDW | 788-0 | Erythrocyte distribution width [Ratio] by Automated count | % |
| MPV | 32623-1 | Platelet mean volume [Entitic volume] in Blood by Automated count | fL |
| NEU% | 770-8 | Neutrophils/100 leukocytes in Blood by Automated count | % |
| LYM% | 736-9 | Lymphocytes/100 leukocytes in Blood by Automated count | % |
| MON% | 5905-5 | Monocytes/100 leukocytes in Blood by Automated count | % |
| EOS% | 713-8 | Eosinophils/100 leukocytes in Blood by Automated count | % |
| BAS% | 706-2 | Basophils/100 leukocytes in Blood by Automated count | % |

### Clinical Chemistry -- Roche Cobas c 111, Hitachi 917/7180

| Test | LOINC Code | LOINC Display | Unit |
|------|-----------|---------------|------|
| Glucose | 2345-7 | Glucose [Mass/volume] in Serum or Plasma | mg/dL |
| BUN | 3094-0 | Urea nitrogen [Mass/volume] in Serum or Plasma | mg/dL |
| Creatinine | 2160-0 | Creatinine [Mass/volume] in Serum or Plasma | mg/dL |
| Total Protein | 2885-2 | Protein [Mass/volume] in Serum or Plasma | g/dL |
| Albumin | 1751-7 | Albumin [Mass/volume] in Serum or Plasma | g/dL |
| Total Bilirubin | 1975-2 | Bilirubin.total [Mass/volume] in Serum or Plasma | mg/dL |
| Direct Bilirubin | 1968-7 | Bilirubin.direct [Mass/volume] in Serum or Plasma | mg/dL |
| ALT (SGPT) | 1742-6 | Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma | U/L |
| AST (SGOT) | 1920-8 | Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma | U/L |
| ALP | 6768-6 | Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma | U/L |
| GGT | 2324-2 | Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma | U/L |
| Cholesterol | 2093-3 | Cholesterol [Mass/volume] in Serum or Plasma | mg/dL |
| Triglycerides | 2571-8 | Triglyceride [Mass/volume] in Serum or Plasma | mg/dL |
| HDL | 2085-9 | Cholesterol in HDL [Mass/volume] in Serum or Plasma | mg/dL |
| LDL | 13457-7 | Cholesterol in LDL [Mass/volume] in Serum or Plasma (calculated) | mg/dL |
| Na | 2951-2 | Sodium [Moles/volume] in Serum or Plasma | mmol/L |
| K | 2823-3 | Potassium [Moles/volume] in Serum or Plasma | mmol/L |
| Cl | 2075-0 | Chloride [Moles/volume] in Serum or Plasma | mmol/L |
| Ca | 17861-6 | Calcium [Mass/volume] in Serum or Plasma | mg/dL |
| Uric Acid | 3084-1 | Urate [Mass/volume] in Serum or Plasma | mg/dL |

### Immunoassay -- Roche Cobas e 411, Snibe Maglumi X3, Tosoh AIA-360

| Test | LOINC Code | LOINC Display | Unit |
|------|-----------|---------------|------|
| TSH | 3016-3 | Thyrotropin [Units/volume] in Serum or Plasma | m[IU]/mL |
| Free T4 | 3024-7 | Thyroxine (T4) free [Mass/volume] in Serum or Plasma | ng/dL |
| Free T3 | 3051-0 | Triiodothyronine (T3) free [Mass/volume] in Serum or Plasma | pg/mL |
| Ferritin | 2276-4 | Ferritin [Mass/volume] in Serum or Plasma | ng/mL |
| Vitamin B12 | 2132-9 | Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma | pg/mL |
| Folate | 2284-8 | Folate [Mass/volume] in Serum or Plasma | ng/mL |
| PSA | 2857-1 | Prostate specific Ag [Mass/volume] in Serum or Plasma | ng/mL |
| hCG | 19080-1 | Choriogonadotropin [Units/volume] in Serum or Plasma | m[IU]/mL |
| Cortisol | 2143-6 | Cortisol [Mass/volume] in Serum or Plasma | ug/dL |
| Insulin | 2484-4 | Insulin [Units/volume] in Serum or Plasma | u[IU]/mL |

### HbA1c -- Bio-Rad D-10

| Test | LOINC Code | LOINC Display | Unit |
|------|-----------|---------------|------|
| HbA1c | 4548-4 | Hemoglobin A1c/Hemoglobin.total in Blood | % |
| HbA1c (IFCC) | 59261-8 | Hemoglobin A1c/Hemoglobin.total in Blood by IFCC protocol | mmol/mol |

### Blood Gas -- Siemens RapidPoint 500e

| Test | LOINC Code | LOINC Display | Unit |
|------|-----------|---------------|------|
| pH | 2744-1 | pH of Arterial blood | [pH] |
| pCO2 | 2019-8 | Carbon dioxide [Partial pressure] in Arterial blood | mm[Hg] |
| pO2 | 2703-7 | Oxygen [Partial pressure] in Arterial blood | mm[Hg] |
| HCO3 | 1959-6 | Bicarbonate [Moles/volume] in Arterial blood | mmol/L |
| Base Excess | 1925-7 | Base excess in Arterial blood by calculation | mmol/L |
| sO2 | 2708-6 | Oxygen saturation in Arterial blood | % |
| Lactate | 2524-7 | Lactate [Moles/volume] in Arterial blood | mmol/L |

---

## Limitations & Caveats

1. **LOINC code accuracy**: The LOINC codes listed are the most common mappings, but the exact code depends on the analyzer method. Some analyzers may use method-specific LOINC codes. The per-analyzer mapping files should be verified with the actual analyzer output.

2. **UCUM validation**: Not all UCUM codes are validated against an official UCUM validator. The mappings are based on the UCUM specification and common usage in FHIR implementations.

3. **Transaction bundle size**: Medplum (like most FHIR servers) may have limits on transaction bundle size. A CBC with 20+ components should be fine, but very large panels should be tested.

4. **Existing report handling**: The current approach creates a new DiagnosticReport each time. If the analyzer sends results in multiple batches for the same order, the middleware should check for and update the existing report (matching the EMR's `createOrUpdateReport` pattern from `diagnosticReportService.ts`).

5. **Specimen reference**: The Specimen may not exist yet if the lab tech has not recorded collection in MediMind. The middleware should handle this gracefully by omitting the Specimen reference rather than failing.

---

## Sources Consulted

1. **FHIR R4 Observation specification** -- https://hl7.org/fhir/R4/observation.html -- Credibility: High (official spec)
2. **FHIR R4 Observation interpretation value set** -- https://www.hl7.org/fhir/R4/valueset-observation-interpretation.html -- Credibility: High
3. **HL7 v3-ObservationInterpretation code system** -- https://terminology.hl7.org/CodeSystem-v3-ObservationInterpretation.html -- Credibility: High
4. **Medplum documentation (Context7)** -- MedplumClient API, transaction bundles, authentication -- Credibility: High
5. **MediMind EMR codebase** -- `labResultService.ts`, `diagnosticReportService.ts`, `fhir-systems.ts`, `specimenService.ts`, `labOrderService.ts`, `specimenLabelService.ts` -- Credibility: High (primary source, this is the system we must integrate with)
6. **Medplum receiving lab results guide** -- Health Gorilla integration example showing Observation structure -- Credibility: High
7. **UCUM specification** -- https://ucum.nlm.nih.gov/ -- Credibility: High (official standard)
