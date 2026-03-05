# HL7v2 Protocol & MLLP Transport — Research Document

**Date:** 2026-03-05
**Purpose:** Comprehensive reference for implementing HL7v2 ORU^R01 parsing in the MediMind Lab Middleware, specifically for receiving CBC results from a Mindray BC-3510 hematology analyzer.

**Think of it as:** HL7v2 is the "language" that lab machines use to describe test results. MLLP is the "envelope" that wraps each message so the receiver knows where one message ends and the next begins. ORU^R01 is the specific "sentence type" that means "here are some test results."

---

## Table of Contents

1. [MLLP — Minimum Lower Layer Protocol (Transport)](#1-mllp--minimum-lower-layer-protocol-transport)
2. [HL7v2 Message Structure](#2-hl7v2-message-structure)
3. [MSH — Message Header Segment](#3-msh--message-header-segment)
4. [ORU^R01 — Observation Result Message](#4-orur01--observation-result-message)
5. [OBX — Observation Result Segment (Deep Dive)](#5-obx--observation-result-segment-deep-dive)
6. [ACK — Acknowledgment Message](#6-ack--acknowledgment-message)
7. [Real ORU^R01 Message Examples](#7-real-orur01-message-examples)
8. [Mindray BC-3510 Specifics](#8-mindray-bc-3510-specifics)
9. [Implementation Notes for Node.js](#9-implementation-notes-for-nodejs)
10. [Sources](#10-sources)

---

## 1. MLLP — Minimum Lower Layer Protocol (Transport)

### What Is MLLP?

MLLP (Minimum Lower Layer Protocol) is a simple framing protocol that wraps HL7v2 messages so the receiver can detect where each message starts and ends. Think of it like putting a letter in an envelope with a clear "start here" and "end here" marker — without it, a TCP stream is just a continuous river of bytes with no way to tell where one message stops and another begins.

MLLP sits at the OSI session layer and provides the absolute minimum framing needed to transmit HL7v2 messages reliably.

### Framing Bytes

Every MLLP-wrapped message uses exactly three special bytes:

| Byte | Hex Value | ASCII Name | Common Notation | Purpose |
|------|-----------|------------|-----------------|---------|
| Start Block | `0x0B` | VT (Vertical Tab) | `\v` or `^K` | Marks the beginning of a message |
| End Block | `0x1C` | FS (File Separator) | `^\` | Marks the end of the message body |
| Carriage Return | `0x0D` | CR (Carriage Return) | `\r` | Immediately follows the end block |

### Message Frame Format

```
<SB>message_content<EB><CR>
```

Expanded:

```
[0x0B] MSH|^~\&|...<CR>PID|...<CR>OBR|...<CR>OBX|...<CR> [0x1C][0x0D]
```

In bytes:

```
0x0B                          ← Start Block (VT) — "a message is starting"
M S H | ^ ~ \ & | ...        ← HL7 message content
0x0D                          ← CR between segments (part of HL7, not MLLP)
P I D | 1 | ...              ← Next segment
0x0D                          ← CR between segments
...                           ← More segments
0x1C                          ← End Block (FS) — "message body is done"
0x0D                          ← Final CR — "message is complete"
```

**Important distinction:** The `0x0D` characters between segments are part of the HL7v2 message format itself (segment terminators), NOT part of MLLP. MLLP only adds the `0x0B` at the start and the `0x1C 0x0D` at the end.

### MLLP Over TCP

This is the standard and most common transport. Here is how it works:

1. **Connection:** The middleware opens a TCP server socket on a configured port (e.g., port 2575, which is the IANA-assigned port for MLLP).
2. **Listening:** The server waits for the analyzer to connect.
3. **Receiving:** When data arrives, the server buffers incoming bytes until it sees the `0x0B` start marker, then accumulates everything until it sees the `0x1C 0x0D` end sequence.
4. **Processing:** The bytes between `0x0B` and `0x1C` are the HL7v2 message. Parse it.
5. **Responding:** Build an ACK message, wrap it in MLLP framing (`0x0B` + ACK + `0x1C 0x0D`), and send it back on the same TCP connection.
6. **Connection lifecycle:** The TCP connection typically stays open (persistent) for multiple messages. The analyzer sends one message, waits for the ACK, then sends the next.

**Pseudocode for TCP MLLP receiver:**

```
buffer = empty
on_data_received(chunk):
    buffer += chunk
    while buffer contains 0x0B...0x1C 0x0D:
        start = index_of(0x0B) + 1
        end = index_of(0x1C)
        message = buffer[start..end]
        parse_hl7(message)
        ack = build_ack(message)
        send(0x0B + ack + 0x1C + 0x0D)
        buffer = buffer[end+2..]  // skip past 0x1C 0x0D
```

### MLLP Over Serial (RS-232)

Some analyzers (including Mindray hematology models) use HL7v2 with MLLP framing over serial RS-232 connections instead of TCP. The protocol is identical — the same `0x0B` / `0x1C 0x0D` framing — but the transport is a serial port instead of a TCP socket.

Key differences from TCP:

| Aspect | MLLP over TCP | MLLP over Serial |
|--------|--------------|-------------------|
| Connection | TCP socket on a port | Serial port (COM3, etc.) |
| Settings | IP address + port | Baud rate, data bits, parity, stop bits |
| Connection detection | TCP connect/disconnect events | DTR/DSR signals, or just data presence |
| Flow control | TCP handles this | May need RTS/CTS hardware flow control |
| Typical baud | N/A | 9600 baud, 8-N-1 |
| Buffering | TCP stream | Serial buffer (may need larger buffers at low baud) |
| Multi-message | Multiple messages per connection (persistent) | Continuous stream on the serial line |

**Serial implementation considerations:**
- At 9600 baud, a 2KB HL7 message takes about 2 seconds to transmit — the receiver must be patient and buffer until `0x1C 0x0D` arrives.
- Serial ports do not have "connections" like TCP. The port is either open or closed. The analyzer just starts sending data whenever it has results.
- There is no TCP-level error detection. If bytes are corrupted, the HL7 message will fail parsing (garbage data). Some implementations add checksums or rely on the analyzer to retransmit.
- Some analyzers that claim "HL7 over serial" may NOT use MLLP framing at all — they may send raw HL7 messages terminated only by a CR. Always verify with the analyzer's interface manual.

### Connection Management

**Persistent connections (most common):**
- The analyzer opens a TCP connection and keeps it open indefinitely.
- Multiple HL7 messages are sent over the same connection.
- Each message is independently framed with MLLP.
- The middleware must handle connection drops and reconnection.

**Per-message connections (less common):**
- The analyzer opens a new TCP connection for each message.
- Sends one MLLP-framed message, waits for ACK, then closes the connection.
- Simpler but higher overhead.
- Some older analyzers work this way.

**For serial connections:**
- The serial port stays open for the entire lifetime of the middleware.
- There is no concept of "connecting" — the middleware simply opens the port and starts listening.
- Messages are delineated purely by the MLLP framing bytes.

---

## 2. HL7v2 Message Structure

### Overview

An HL7v2 message is a block of text made up of **segments**. Each segment is one line of text (terminated by `0x0D` carriage return). Think of it like a CSV file where each line is a different type of record, and each line has pipe-separated fields.

### Segments

Every segment starts with a 3-letter segment ID that identifies what kind of data it contains:

```
MSH|^~\&|LAB|HOSPITAL|EMR|HOSPITAL|20260305120000||ORU^R01|MSG001|P|2.3.1
PID|1||12345^^^HOSP||DOE^JOHN||19800115|M
OBR|1||A12345|CBC^Complete Blood Count
OBX|1|NM|WBC^White Blood Cells||7.5|10*3/uL|4.5-11.0|N|||F
OBX|2|NM|RBC^Red Blood Cells||4.8|10*6/uL|4.5-5.5|N|||F
```

Each line is a segment. `MSH` = Message Header, `PID` = Patient ID, `OBR` = Observation Request, `OBX` = Observation Result.

### Field Separators and Encoding Characters

The first segment (MSH) defines the special characters used throughout the entire message:

**MSH-1: Field Separator** — Always `|` (pipe). This separates fields within a segment.

**MSH-2: Encoding Characters** — Typically `^~\&`. These four characters (in order) define:

| Character | Name | Purpose | Example |
|-----------|------|---------|---------|
| `^` | Component Separator | Separates parts within a field | `DOE^JOHN` (last name ^ first name) |
| `~` | Repetition Separator | Separates multiple values in one field | `HOME~WORK` (two phone numbers) |
| `\` | Escape Character | Allows special characters in text | `\T\` represents `&` |
| `&` | Sub-component Separator | Separates parts within a component | `SYSTEM&OID` |

**Note:** In HL7 v2.7+, a fifth encoding character was added: `#` (Truncation Character). For v2.3.1 (which the Mindray BC-3510 uses), there are only four encoding characters.

### Field Indexing

Fields are numbered starting from 1 for each segment. However, MSH is special:

- **MSH-1** is the field separator character itself (`|`) — it is NOT the first text after the segment ID.
- **MSH-2** is `^~\&` — the encoding characters.
- **MSH-3** is the first "normal" field (Sending Application).

For all other segments, field numbering is straightforward:
```
PID|1||12345^^^HOSP||DOE^JOHN
     ^  ^              ^
     |  |              PID-5 (Patient Name)
     |  PID-3 (Patient ID Internal)
     PID-1 (Set ID)
```

Empty fields are indicated by consecutive pipe characters: `||` means the field is empty/not provided.

### Common Escape Sequences

| Escape | Meaning |
|--------|---------|
| `\F\` | Field separator (`\|`) |
| `\S\` | Component separator (`^`) |
| `\T\` | Subcomponent separator (`&`) |
| `\R\` | Repetition separator (`~`) |
| `\E\` | Escape character (`\`) |
| `\.br\` | Line break |
| `\X0D\` | Hex character 0x0D |

### Data Types

Common HL7v2 data types used in lab messages:

| Type | Name | Example | Description |
|------|------|---------|-------------|
| ST | String | `Hello World` | Simple text |
| NM | Numeric | `7.5` | Decimal number |
| TS | Timestamp | `20260305120000` | Date/time (YYYYMMDDHHMMSS) |
| CE | Coded Entry | `WBC^White Blood Cells^L` | Code ^ description ^ coding system |
| CX | Extended Composite ID | `12345^^^HOSP` | ID ^ check digit ^ scheme ^ authority |
| XPN | Extended Person Name | `DOE^JOHN^M^^DR` | Last ^ first ^ middle ^ suffix ^ prefix |
| SI | Sequence ID | `1` | Simple integer counter |
| ID | Coded Value | `F` | Single coded value from a defined table |
| HD | Hierarchic Designator | `LAB^1.2.3.4^ISO` | Namespace ^ universal ID ^ type |
| CQ | Composite Quantity | `10^mL` | Quantity ^ units |
| XCN | Extended Composite Name | `12345^DOE^JOHN^M^^DR` | ID ^ last ^ first ^ middle ^ suffix ^ prefix |

---

## 3. MSH — Message Header Segment

The MSH segment is the first segment in every HL7v2 message. It tells the receiver who sent the message, what kind of message it is, and how to parse it. Think of it as the "envelope label" for the message.

### Complete MSH Field Reference

| Field | Name | Type | Req? | Description |
|-------|------|------|------|-------------|
| MSH-1 | Field Separator | ST | **R** | Always `\|`. Defines the field delimiter for the entire message. |
| MSH-2 | Encoding Characters | ST | **R** | Usually `^~\&`. Defines component, repetition, escape, and sub-component separators. |
| MSH-3 | Sending Application | HD | O | The software/system that generated the message (e.g., `BC-3510`, `LIS`). |
| MSH-4 | Sending Facility | HD | O | The organization or location sending (e.g., `LAB`, `MAIN_LAB`). |
| MSH-5 | Receiving Application | HD | O | The intended recipient system (e.g., `MIDDLEWARE`, `LIS`). |
| MSH-6 | Receiving Facility | HD | O | The intended recipient organization (e.g., `HOSPITAL`). |
| MSH-7 | Date/Time of Message | TS | O | When the message was created (e.g., `20260305143000`). |
| MSH-8 | Security | ST | O | Optional security token. Rarely used by lab analyzers. |
| MSH-9 | Message Type | CM | **R** | The message type and trigger event (e.g., `ORU^R01` for observation results). |
| MSH-10 | Message Control ID | ST | **R** | A unique identifier for this specific message. Used in ACK responses. **Critical for matching ACKs to messages.** |
| MSH-11 | Processing ID | PT | **R** | `P` = Production, `D` = Debugging, `T` = Training. |
| MSH-12 | Version ID | ID | **R** | HL7 version (e.g., `2.3.1`, `2.4`, `2.5`). |
| MSH-13 | Sequence Number | NM | O | Optional sequential number for ordered delivery. |
| MSH-14 | Continuation Pointer | ST | O | Used for splitting long messages across multiple transmissions. |
| MSH-15 | Accept Acknowledgment Type | ID | O | `AL` = Always, `NE` = Never, `ER` = Error only, `SU` = Successful only. |
| MSH-16 | Application Acknowledgment Type | ID | O | Same values as MSH-15, for application-level ACKs. |
| MSH-17 | Country Code | ID | O | ISO 3166 country code. |
| MSH-18 | Character Set | ID | O | Character encoding. Empty = ASCII. `UNICODE UTF-8` for Unicode. |
| MSH-19 | Principal Language of Message | CE | O | Language code (e.g., `en` for English). |

### Example MSH Segment

```
MSH|^~\&|BC-3510|MAIN_LAB|MIDDLEWARE|HOSPITAL|20260305143000||ORU^R01|MSG00001|P|2.3.1|||AL|NE
```

Decoded:
- **MSH-1:** `|` (field separator)
- **MSH-2:** `^~\&` (encoding characters)
- **MSH-3:** `BC-3510` (Mindray analyzer)
- **MSH-4:** `MAIN_LAB` (lab facility)
- **MSH-5:** `MIDDLEWARE` (our system)
- **MSH-6:** `HOSPITAL` (our facility)
- **MSH-7:** `20260305143000` (March 5, 2026, 2:30 PM)
- **MSH-8:** (empty — no security)
- **MSH-9:** `ORU^R01` (observation result)
- **MSH-10:** `MSG00001` (unique message ID)
- **MSH-11:** `P` (production)
- **MSH-12:** `2.3.1` (HL7 version)
- **MSH-15:** `AL` (always send accept ACK)
- **MSH-16:** `NE` (never send application ACK)

---

## 4. ORU^R01 — Observation Result Message

### What Is ORU^R01?

ORU^R01 stands for **O**bservation **R**esult **U**nsolicited, trigger event **R01**. It is the message type that lab analyzers use to send test results to an LIS or middleware without being asked (unsolicited). When the Mindray BC-3510 finishes a CBC test, it sends an ORU^R01 message containing all the result values.

This is THE most important message type for our middleware.

### Segment Grammar (Message Structure)

The ORU^R01 message follows this hierarchical structure:

```
MSH                           ← Message Header (required, exactly one)
{                             ← Patient group (repeating)
  PID                         ← Patient Identification (required)
  [PV1]                       ← Patient Visit (optional)
  {                           ← Order group (repeating)
    [ORC]                     ← Common Order (optional)
    OBR                       ← Observation Request (required — the test panel)
    [{NTE}]                   ← Notes/Comments on the order (optional, repeating)
    {                         ← Observation group (repeating)
      OBX                     ← Observation Result (required — individual test result)
      [{NTE}]                 ← Notes/Comments on the result (optional, repeating)
    }
  }
}
```

**Legend:** `[ ]` = optional, `{ }` = repeating, no brackets = required.

In plain English: one message header, then for each patient there is a PID, optionally a PV1, then one or more order groups. Each order group has an OBR (the test panel like "CBC") and one or more OBX segments (individual results like WBC, RBC, HGB).

### Segment-by-Segment Breakdown

#### MSH — Message Header
(See Section 3 above for full field reference.)

#### PID — Patient Identification

Contains demographic information about the patient. Lab analyzers typically populate only a few fields.

| Field | Name | Type | Req? | Lab Usage |
|-------|------|------|------|-----------|
| PID-1 | Set ID | SI | O | Usually `1` |
| PID-2 | Patient ID (External) | CX | O | External patient ID |
| PID-3 | Patient ID (Internal) | CX | **R** | **Primary patient identifier (MRN, hospital ID)**. This is the most important field for matching. |
| PID-4 | Alternate Patient ID | CX | O | Alternate ID |
| PID-5 | Patient Name | XPN | **R** | `LASTNAME^FIRSTNAME^MIDDLE^^PREFIX`. Analyzers may populate from barcode lookup or leave blank. |
| PID-6 | Mother's Maiden Name | XPN | O | Rarely used by analyzers |
| PID-7 | Date/Time of Birth | TS | O | `YYYYMMDD` format |
| PID-8 | Sex | IS | O | `M` = Male, `F` = Female, `O` = Other, `U` = Unknown |
| PID-9-30 | Various demographics | Various | O | Address, phone, race, etc. — typically not populated by analyzers |

**Typical analyzer output:** Analyzers often send minimal PID data. If the analyzer has a bidirectional LIS connection, PID may be populated from a previous query. If results are unidirectional (just sending results), PID may contain only a patient ID from a scanned barcode and empty name fields.

Example:
```
PID|1||PAT12345^^^HOSPITAL||DOE^JOHN^M||19800115|M
```

#### PV1 — Patient Visit (Optional)

Contains information about the patient's visit (inpatient, outpatient, etc.). Usually optional and often empty from lab analyzers.

| Field | Name | Lab Usage |
|-------|------|-----------|
| PV1-1 | Set ID | Usually `1` |
| PV1-2 | Patient Class | `O` = Outpatient, `I` = Inpatient, `E` = Emergency |
| PV1-3 | Assigned Patient Location | Ward/room |
| PV1-7 | Attending Doctor | Ordering physician |

Most lab analyzers send a minimal or empty PV1:
```
PV1|1|O
```

#### ORC — Common Order (Optional)

Contains order-level information. Optional in ORU messages. Some analyzers include it, some do not.

| Field | Name | Lab Usage |
|-------|------|-----------|
| ORC-1 | Order Control | `RE` = Observations/Performed Service to follow |
| ORC-2 | Placer Order Number | Order number from the ordering system |
| ORC-3 | Filler Order Number | Order number from the filling system (analyzer/lab) |
| ORC-5 | Order Status | `CM` = Completed |
| ORC-9 | Date/Time of Transaction | When the order was processed |
| ORC-12 | Ordering Provider | The physician who ordered the test |

Example:
```
ORC|RE|ORD001||||||||||12345^SMITH^JOHN^^^^^DR
```

#### OBR — Observation Request

This segment identifies WHAT test was ordered/performed. For a CBC, this is the "Complete Blood Count" panel. There is one OBR per test panel, and multiple OBX segments below it for each individual parameter.

| Field | Name | Type | Req? | Description |
|-------|------|------|------|-------------|
| OBR-1 | Set ID | SI | C | Sequence number (usually `1`) |
| OBR-2 | Placer Order Number | EI | C | Order number from the ordering system (LIS/EMR). **Used to link results back to the original order.** |
| OBR-3 | Filler Order Number | EI | C | Order number assigned by the lab/analyzer. **Often contains the specimen barcode.** |
| OBR-4 | Universal Service ID | CE | **R** | **The test code and name** (e.g., `CBC^Complete Blood Count^L` or `57021-8^CBC W Auto Differential^LN`). |
| OBR-5 | Priority | ID | O | `S` = Stat, `R` = Routine, `A` = ASAP |
| OBR-7 | Observation Date/Time | TS | C | **When the specimen was collected or the test was run.** |
| OBR-8 | Observation End Date/Time | TS | O | When the observation ended. |
| OBR-9 | Collection Volume | CQ | O | Volume of specimen collected. |
| OBR-13 | Relevant Clinical Info | ST | O | Clinical notes. |
| OBR-14 | Specimen Received Date/Time | TS | C | When the lab received the specimen. |
| OBR-15 | Specimen Source | SPS | O | Type of specimen (blood, urine, etc.) |
| OBR-16 | Ordering Provider | XCN | O | The physician who ordered the test. |
| OBR-22 | Results Report/Status Change Date/Time | TS | C | When results were reported. |
| OBR-24 | Diagnostic Service Section ID | ID | O | `HM` = Hematology, `CH` = Chemistry, `IM` = Immunology. |
| OBR-25 | Result Status | ID | C | `F` = Final, `P` = Preliminary, `C` = Corrected. **Required in result messages.** |

Example:
```
OBR|1|ORD001|SPEC-BC001|CBC^Complete Blood Count^L|||20260305140000|||||||20260305140000||12345^SMITH^JOHN|||||||20260305143000||HM|F
```

#### NTE — Notes and Comments (Optional)

Follows OBR or OBX segments to provide free-text comments.

| Field | Name | Description |
|-------|------|-------------|
| NTE-1 | Set ID | Sequence number |
| NTE-2 | Source of Comment | `L` = Lab, `P` = Patient, `O` = Other |
| NTE-3 | Comment | Free text comment |

Example:
```
NTE|1|L|Sample slightly hemolyzed
```

---

## 5. OBX — Observation Result Segment (Deep Dive)

The OBX segment is the heart of laboratory results. Each OBX contains ONE measurement — one test parameter with its value, units, reference range, and interpretation. A CBC message typically has 15-25 OBX segments (one for each parameter: WBC, RBC, HGB, HCT, PLT, MCV, MCH, MCHC, RDW, MPV, etc.).

### Complete OBX Field Reference

| Field | Name | Type | Req? | Description |
|-------|------|------|------|-------------|
| OBX-1 | Set ID | SI | O | Sequence number within this group (1, 2, 3...). |
| OBX-2 | Value Type | ID | **R*** | **Data type of OBX-5** (e.g., `NM` for numeric, `ST` for string). Required when OBX-5 has a value. |
| OBX-3 | Observation Identifier | CE | **R** | **The test code** — identifies what was measured (e.g., `WBC^White Blood Cells^L`). |
| OBX-4 | Observation Sub-ID | ST | O | Distinguishes multiple OBX with the same OBX-3 (e.g., for repeated measurements). |
| OBX-5 | Observation Value | * | O | **THE ACTUAL RESULT VALUE** (e.g., `7.5`). Data type is defined by OBX-2. |
| OBX-6 | Units | CE | O | **Units of measurement** (e.g., `10*3/uL`, `g/dL`, `%`). |
| OBX-7 | Reference Range | ST | O | **Normal range** as text (e.g., `4.5-11.0`, `3.7-5.0`). |
| OBX-8 | Abnormal Flags | IS | O | **Interpretation flag** — is this result normal or abnormal? (e.g., `H`, `L`, `N`). Repeating field. |
| OBX-9 | Probability | NM | O | Probability of a test result being abnormal (0-1 or percentage). Rarely used. |
| OBX-10 | Nature of Abnormal Test | ID | O | `A` = Age-based, `S` = Sex-based, `R` = Race-based, `N` = None. |
| OBX-11 | Observation Result Status | ID | **R** | **Status of this result** (e.g., `F` = Final, `P` = Preliminary). |
| OBX-12 | Effective Date of Reference Range | TS | O | When the reference range was last updated. |
| OBX-13 | User-Defined Access Checks | ST | O | Access control codes. |
| OBX-14 | Date/Time of the Observation | TS | O | **When this specific observation was made.** |
| OBX-15 | Producer's ID | CE | O | Identifies the lab that produced the result. |
| OBX-16 | Responsible Observer | XCN | O | The person who made/verified the observation. |
| OBX-17 | Observation Method | CE | O | Method used for the measurement. |

### OBX-2: Value Types (What Kind of Data Is in OBX-5?)

| Code | Name | Description | Example OBX-5 Value |
|------|------|-------------|-------------------|
| **NM** | Numeric | A decimal number. **Most common for lab results.** | `7.5` |
| **ST** | String | Plain text. | `Positive` |
| **CE** | Coded Entry | A coded value with code^description^system. | `260385009^Negative^SCT` |
| **TX** | Text | Multi-line free text. | `No abnormalities detected.` |
| **FT** | Formatted Text | Text with formatting codes. | `\.br\Line 1\.br\Line 2` |
| **SN** | Structured Numeric | Number with comparator (for values like "<10" or ">200"). | `<^10` or `>^200` |
| **ED** | Encapsulated Data | Binary data (images, PDFs). | Base64 encoded data |
| **TS** | Timestamp | Date/time value. | `20260305143000` |
| **CWE** | Coded with Exceptions | Like CE but allows exceptions (v2.5+). | Same as CE format |

**For CBC results from hematology analyzers, almost all values will be NM (numeric).**

### OBX-8: Abnormal Flags (HL7 Table 0078)

These flags tell you whether the result is within normal limits. This is critical for clinical alerting.

| Flag | Meaning | Description |
|------|---------|-------------|
| **N** | Normal | Result is within normal range. |
| **L** | Low | Result is below the normal low limit. |
| **H** | High | Result is above the normal high limit. |
| **LL** | Critically Low | Result is below the critical (panic) low limit. **Requires immediate attention.** |
| **HH** | Critically High | Result is above the critical (panic) high limit. **Requires immediate attention.** |
| **A** | Abnormal | Abnormal, but direction (high/low) is not applicable (used for non-numeric results). |
| **AA** | Critically Abnormal | Very abnormal (non-numeric equivalent of LL/HH). |
| **D** | Significant Change Down | Value has decreased significantly from a previous result. |
| **U** | Significant Change Up | Value has increased significantly from a previous result. |
| **B** | Better | Result is better than expected (direction not relevant). |
| **W** | Worse | Result is worse than expected (direction not relevant). |
| **S** | Susceptible | (Microbiology) organism is susceptible to the antibiotic. |
| **R** | Resistant | (Microbiology) organism is resistant to the antibiotic. |
| **I** | Intermediate | (Microbiology) intermediate susceptibility. |
| **MS** | Moderately Susceptible | (Microbiology) moderately susceptible. |
| **VS** | Very Susceptible | (Microbiology) very susceptible. |
| (empty) | No flag | No interpretation available or not evaluated. |

**For hematology CBC results, you will primarily see: `N`, `L`, `H`, `LL`, `HH`, or empty.**

**Multiple flags:** OBX-8 is a repeating field. Multiple flags can be separated by the repetition separator (`~`). For example: `A~W` means "Abnormal AND Worse."

### OBX-11: Observation Result Status (HL7 Table 0085)

| Code | Display | Description |
|------|---------|-------------|
| **F** | Final | Results have been verified and are final. **Most common for auto-released results.** |
| **P** | Preliminary | Results are preliminary, not yet finalized. |
| **C** | Correction | This result replaces a previously sent final result. |
| **R** | Unverified | Results have been entered but not yet verified/reviewed. |
| **I** | Pending | Specimen is in the lab; results are pending. |
| **D** | Deleted | Previously sent OBX should be deleted. |
| **W** | Wrong Patient | Previously sent result was for the wrong patient. |
| **X** | Cannot Obtain | Results cannot be obtained (e.g., insufficient sample). |
| **U** | Updated to Final | Status changed to final without re-sending the result value. |
| **A** | Amended | Result was amended based on Placer (physician) input. |
| **B** | Appended | Additional information appended without changing the original result. |
| **V** | Verified | Final result reviewed and confirmed correct, no value change. |
| **N** | Not Asked | The test identified by OBX-3 was not performed. |
| **O** | Order Only | Placeholder; no result yet. |

**For our middleware, the key statuses are:**
- **F** (Final) — Process and send to FHIR. This is the standard status for completed results.
- **P** (Preliminary) — Process and send, but mark as preliminary in FHIR.
- **C** (Correction) — Process and update the existing FHIR Observation.
- **X** (Cannot Obtain) — Log but do not create a FHIR Observation with a value.

### OBX-3: Observation Identifier Format

OBX-3 uses the CE (Coded Entry) data type:

```
CODE^DESCRIPTION^CODING_SYSTEM
```

Examples:
```
WBC^White Blood Cells^L          ← Local code "WBC" with description
6690-2^Leukocytes^LN             ← LOINC code 6690-2
789-8^Erythrocytes^LN            ← LOINC code 789-8
WBC^White Blood Count (WBC)^00065227^6690-2^Leukocytes^pCLOCD  ← Mixed local + LOINC
```

The coding system identifiers:
- `L` = Local code (analyzer-specific)
- `LN` = LOINC (Logical Observation Identifiers Names and Codes)
- `pCLOCD` = Profile CLOCD (a LOINC derivative)

**Important for our middleware:** Mindray analyzers typically send local codes (like `WBC`, `RBC`, `HGB`). We need an analyzer-specific mapping table to convert these to LOINC codes for FHIR Observations.

### Complete OBX Example with Annotations

```
OBX|1|NM|WBC^White Blood Cells^L|1|7.5|10*3/uL|4.5-11.0|N|||F|||20260305143000|MAIN_LAB
```

Field-by-field:
- **OBX-1** = `1` — First observation in this group
- **OBX-2** = `NM` — The value is numeric
- **OBX-3** = `WBC^White Blood Cells^L` — Local code "WBC", description "White Blood Cells"
- **OBX-4** = `1` — Sub-ID (distinguishes multiple results with same code)
- **OBX-5** = `7.5` — **THE RESULT: WBC count is 7.5**
- **OBX-6** = `10*3/uL` — Units: thousand per microliter
- **OBX-7** = `4.5-11.0` — Reference range: 4.5 to 11.0
- **OBX-8** = `N` — Normal (within reference range)
- **OBX-9** = (empty) — No probability
- **OBX-10** = (empty) — No nature of abnormal test
- **OBX-11** = `F` — Final result
- **OBX-12** = (empty)
- **OBX-13** = (empty)
- **OBX-14** = `20260305143000` — Observed at 2:30 PM on March 5, 2026
- **OBX-15** = `MAIN_LAB` — Produced by the main lab

---

## 6. ACK — Acknowledgment Message

### Why Send ACK?

After receiving an ORU^R01 message, the middleware MUST send back an ACK (acknowledgment) message. This tells the analyzer:
- "I received your message" (AA = accepted)
- "I received your message but something was wrong" (AE = error)
- "I could not process your message at all" (AR = rejected)

Without an ACK, most analyzers will retransmit the same message repeatedly, or stop sending entirely.

### ACK Message Structure

An ACK is a very simple HL7 message with just two segments:

```
MSH|^~\&|MIDDLEWARE|HOSPITAL|BC-3510|MAIN_LAB|20260305143001||ACK^R01|ACK00001|P|2.3.1
MSA|AA|MSG00001
```

**Segment 1 — MSH (Message Header):**
- MSH-3 and MSH-4 are now the MIDDLEWARE (we are the sender of the ACK)
- MSH-5 and MSH-6 are the original sender (the analyzer)
- MSH-7 is the current timestamp
- MSH-9 is `ACK^R01` (acknowledging an R01 event) or simply `ACK`
- MSH-10 is a unique ID for THIS ACK message
- MSH-12 must match the version from the original message

**Segment 2 — MSA (Message Acknowledgment):**

| Field | Name | Description |
|-------|------|-------------|
| MSA-1 | Acknowledgment Code | `AA`, `AE`, or `AR` (see below) |
| MSA-2 | Message Control ID | **Must match MSH-10 from the original message.** This is how the analyzer knows which message is being acknowledged. |
| MSA-3 | Text Message | Optional human-readable error description |
| MSA-4 | Expected Sequence Number | Optional, rarely used |
| MSA-5 | Delayed Acknowledgment Type | Deprecated |
| MSA-6 | Error Condition | Optional coded error |

### Acknowledgment Codes

| Code | Name | When to Use |
|------|------|-------------|
| **AA** | Application Accept | Message was received and processed successfully. **Send this when everything works.** |
| **AE** | Application Error | Message was received but had errors during processing (e.g., unknown patient, invalid data). The sending system may try to correct and resend. |
| **AR** | Application Reject | Message was rejected entirely (e.g., unsupported message type, authentication failure). The sending system should not resend the same message. |

### Optional ERR Segment

When returning AE or AR, you can optionally include an ERR segment with error details:

```
MSH|^~\&|MIDDLEWARE|HOSPITAL|BC-3510|MAIN_LAB|20260305143001||ACK^R01|ACK00001|P|2.3.1
MSA|AE|MSG00001|Patient not found in system
ERR|^^^207&Application Internal Error&HL70357
```

### ACK Examples

**Successful acceptance (AA):**
```
MSH|^~\&|MIDDLEWARE|HOSPITAL|BC-3510|MAIN_LAB|20260305143001||ACK^R01|ACK00001|P|2.3.1
MSA|AA|MSG00001
```

**Error during processing (AE):**
```
MSH|^~\&|MIDDLEWARE|HOSPITAL|BC-3510|MAIN_LAB|20260305143001||ACK^R01|ACK00002|P|2.3.1
MSA|AE|MSG00001|Unable to parse OBX segment 5
```

**Message rejected (AR):**
```
MSH|^~\&|MIDDLEWARE|HOSPITAL|BC-3510|MAIN_LAB|20260305143001||ACK^R01|ACK00003|P|2.3.1
MSA|AR|MSG00001|Unsupported HL7 version
```

### When to Send Each

| Situation | Code | Rationale |
|-----------|------|-----------|
| Message parsed, results extracted, queued for FHIR | **AA** | Everything worked |
| Message parsed, but one OBX had invalid data | **AA** | We can still process the other OBX segments; log the error |
| Message could not be parsed at all (malformed) | **AE** | Tell the analyzer something is wrong |
| Unrecognized message type (not ORU^R01) | **AR** | We do not handle this message type |
| MLLP framing is wrong (no start/end blocks) | No ACK | Cannot parse enough to build a response |
| Medplum Cloud is down | **AA** | We accepted the message (it is queued locally); the cloud issue is our problem, not the analyzer's |

**Critical rule:** ALWAYS send AA if we successfully parsed the message, even if we cannot immediately forward to Medplum. The local queue handles retries. Sending AE or AR would cause the analyzer to retransmit or stop sending, which is worse.

---

## 7. Real ORU^R01 Message Examples

### Example 1: CBC with Abnormal Values

This is a realistic ORU^R01 message from a hematology analyzer reporting a Complete Blood Count with some abnormal values.

**Raw message (as it would appear between MLLP framing bytes):**

```
MSH|^~\&|LIS|MAIN_LAB|MIDDLEWARE|HOSPITAL|20260305140000||ORU^R01|MSG20260305001|P|2.3.1|||AL|NE
PID|1||PAT-2026-0847^^^HOSP^MR||BERIDZE^GIORGI||19751220|M|||15 RUSTAVELI AVE^^TBILISI^^0108^GE||555-0147
PV1|1|O|LAB||||12345^KATSARAVA^NINO
ORC|RE|ORD-20260305-001|||CM
OBR|1|ORD-20260305-001|SPEC-BC-0305|CBC^Complete Blood Count^L|||20260305135500|||||||20260305135800||12345^KATSARAVA^NINO|||||||20260305140000||HM|F
OBX|1|NM|WBC^White Blood Cells^L|1|10.7|10*3/uL|3.5-10.0|H|||F|||20260305140000|MAIN_LAB
OBX|2|NM|RBC^Red Blood Cells^L|1|2.96|10*6/uL|4.4-6.0|L|||F|||20260305140000|MAIN_LAB
OBX|3|NM|HGB^Hemoglobin^L|1|10.3|g/dL|14.0-17.0|L|||F|||20260305140000|MAIN_LAB
OBX|4|NM|HCT^Hematocrit^L|1|31.4|%|41.0-51.0|L|||F|||20260305140000|MAIN_LAB
OBX|5|NM|MCV^Mean Corpuscular Volume^L|1|106.0|fL|80.0-100.0|H|||F|||20260305140000|MAIN_LAB
OBX|6|NM|MCH^Mean Corpuscular Hemoglobin^L|1|34.8|pg|27.0-33.0|H|||F|||20260305140000|MAIN_LAB
OBX|7|NM|MCHC^Mean Corpuscular Hb Concentration^L|1|32.9|g/dL|32.0-36.0|N|||F|||20260305140000|MAIN_LAB
OBX|8|NM|RDW^Red Cell Distribution Width^L|1|20.4|%|11.0-15.0|H|||F|||20260305140000|MAIN_LAB
OBX|9|NM|PLT^Platelets^L|1|245|10*3/uL|150-400|N|||F|||20260305140000|MAIN_LAB
OBX|10|NM|MPV^Mean Platelet Volume^L|1|9.8|fL|7.0-11.0|N|||F|||20260305140000|MAIN_LAB
```

**Field-by-field interpretation of OBX segments:**

| # | Test | Value | Unit | Ref Range | Flag | Meaning |
|---|------|-------|------|-----------|------|---------|
| 1 | WBC | 10.7 | 10*3/uL | 3.5-10.0 | **H** | High — elevated white blood cells |
| 2 | RBC | 2.96 | 10*6/uL | 4.4-6.0 | **L** | Low — low red blood cells |
| 3 | HGB | 10.3 | g/dL | 14.0-17.0 | **L** | Low — anemia |
| 4 | HCT | 31.4 | % | 41.0-51.0 | **L** | Low — low hematocrit |
| 5 | MCV | 106.0 | fL | 80.0-100.0 | **H** | High — macrocytic (large red blood cells) |
| 6 | MCH | 34.8 | pg | 27.0-33.0 | **H** | High — high hemoglobin per cell |
| 7 | MCHC | 32.9 | g/dL | 32.0-36.0 | N | Normal |
| 8 | RDW | 20.4 | % | 11.0-15.0 | **H** | High — variable red cell size |
| 9 | PLT | 245 | 10*3/uL | 150-400 | N | Normal platelets |
| 10 | MPV | 9.8 | fL | 7.0-11.0 | N | Normal platelet volume |

**ACK response we should send:**

```
MSH|^~\&|MIDDLEWARE|HOSPITAL|LIS|MAIN_LAB|20260305140001||ACK^R01|ACK20260305001|P|2.3.1
MSA|AA|MSG20260305001
```

### Example 2: CBC with 3-Part Differential (Mindray BC-3510 Style)

The BC-3510 is a 3-part differential analyzer, meaning it reports WBC subpopulations as three groups: Lymphocytes, Mid-cells (monocytes + eosinophils + basophils), and Granulocytes (neutrophils).

```
MSH|^~\&|BC-3510|LAB|LIS|HOSPITAL|20260305103000||ORU^R01|BC3510-00042|P|2.3.1
PID|1||BC20260305-042^^^LAB||TCHKONIA^MARINE||19880530|F
OBR|1||BC20260305-042|CBC^Complete Blood Count|||20260305102800||||||||||||||20260305103000||HM|F
OBX|1|NM|WBC^WBC^L|1|6.8|10^9/L|4.0-10.0|N|||F|||20260305103000
OBX|2|NM|Lymph#^Lymphocyte Count^L|1|2.1|10^9/L|0.8-4.0|N|||F|||20260305103000
OBX|3|NM|Mid#^Mid-Cell Count^L|1|0.5|10^9/L|0.1-1.5|N|||F|||20260305103000
OBX|4|NM|Gran#^Granulocyte Count^L|1|4.2|10^9/L|2.0-7.0|N|||F|||20260305103000
OBX|5|NM|Lymph%^Lymphocyte Percentage^L|1|30.9|%|20.0-40.0|N|||F|||20260305103000
OBX|6|NM|Mid%^Mid-Cell Percentage^L|1|7.4|%|3.0-15.0|N|||F|||20260305103000
OBX|7|NM|Gran%^Granulocyte Percentage^L|1|61.7|%|50.0-70.0|N|||F|||20260305103000
OBX|8|NM|RBC^RBC^L|1|4.52|10^12/L|3.80-5.10|N|||F|||20260305103000
OBX|9|NM|HGB^Hemoglobin^L|1|13.2|g/dL|12.0-16.0|N|||F|||20260305103000
OBX|10|NM|HCT^Hematocrit^L|1|39.8|%|36.0-46.0|N|||F|||20260305103000
OBX|11|NM|MCV^MCV^L|1|88.1|fL|80.0-100.0|N|||F|||20260305103000
OBX|12|NM|MCH^MCH^L|1|29.2|pg|27.0-34.0|N|||F|||20260305103000
OBX|13|NM|MCHC^MCHC^L|1|33.2|g/dL|32.0-36.0|N|||F|||20260305103000
OBX|14|NM|RDW-CV^RDW-CV^L|1|12.8|%|11.0-16.0|N|||F|||20260305103000
OBX|15|NM|RDW-SD^RDW-SD^L|1|42.5|fL|35.0-56.0|N|||F|||20260305103000
OBX|16|NM|PLT^Platelets^L|1|228|10^9/L|100-300|N|||F|||20260305103000
OBX|17|NM|MPV^MPV^L|1|10.1|fL|6.5-12.0|N|||F|||20260305103000
OBX|18|NM|PDW^PDW^L|1|13.2|fL|9.0-17.0|N|||F|||20260305103000
OBX|19|NM|PCT^Plateletcrit^L|1|0.23|%|0.10-0.50|N|||F|||20260305103000
```

### Example 3: CBC with Critical Values (Flags HH/LL)

This example shows a message with critically abnormal values that require immediate attention.

```
MSH|^~\&|BC-3510|LAB|LIS|HOSPITAL|20260305150000||ORU^R01|BC3510-00099|P|2.3.1
PID|1||PAT-CRIT-001^^^HOSP||CRITICAL^PATIENT||19600101|M
OBR|1||SPEC-CRIT-001|CBC^Complete Blood Count|||20260305145500||||||||||||||20260305150000||HM|F
OBX|1|NM|WBC^WBC^L|1|1.2|10^9/L|4.0-10.0|LL|||F|||20260305150000
OBX|2|NM|RBC^RBC^L|1|1.85|10^12/L|4.50-5.50|LL|||F|||20260305150000
OBX|3|NM|HGB^Hemoglobin^L|1|5.2|g/dL|14.0-17.0|LL|||F|||20260305150000
OBX|4|NM|HCT^Hematocrit^L|1|16.1|%|41.0-51.0|LL|||F|||20260305150000
OBX|5|NM|PLT^Platelets^L|1|22|10^9/L|150-400|LL|||F|||20260305150000
OBX|6|NM|MCV^MCV^L|1|87.0|fL|80.0-100.0|N|||F|||20260305150000
OBX|7|NM|MCH^MCH^L|1|28.1|pg|27.0-33.0|N|||F|||20260305150000
OBX|8|NM|MCHC^MCHC^L|1|32.3|g/dL|32.0-36.0|N|||F|||20260305150000
NTE|1|L|CRITICAL VALUES - PLEASE CALL PHYSICIAN IMMEDIATELY
```

---

## 8. Mindray BC-3510 Specifics

### Overview

The Mindray BC-3510 is a 3-part differential hematology analyzer. It performs Complete Blood Count (CBC) tests and reports WBC, RBC, HGB, HCT, PLT, and related indices. The "3-part differential" means it classifies white blood cells into three groups (Lymphocytes, Mid-cells, Granulocytes) rather than five (Neutrophils, Lymphocytes, Monocytes, Eosinophils, Basophils).

### Communication Protocol

Based on research into Mindray hematology analyzer documentation (BC-3510 is in the same family as BC-3000, BC-3600, and BC-5380):

| Parameter | Value |
|-----------|-------|
| **Protocol** | HL7 v2.3.1 |
| **Transport** | Serial (RS-232, DB-9) and/or TCP/IP |
| **Framing** | MLLP (0x0B / 0x1C 0x0D) |
| **Serial Settings** | 9600 baud, 8 data bits, no parity, 1 stop bit (8-N-1) |
| **Character Encoding** | UTF-8 |
| **Direction** | Bidirectional (can receive orders and send results) |
| **Message Type Sent** | ORU^R01 (observation results) |
| **Message Type Received** | QRY (queries), ORM (orders) |
| **Diagnostic Service ID** | `HM` (Hematology) |

### Expected CBC Parameters from BC-3510

The BC-3510 as a 3-part differential analyzer typically reports these parameters:

| # | Test Code | Full Name | LOINC Code | Units | Typical Ref Range |
|---|-----------|-----------|------------|-------|-------------------|
| 1 | WBC | White Blood Cell Count | 6690-2 | 10^9/L | 4.0-10.0 |
| 2 | Lymph# | Lymphocyte Count (absolute) | 731-0 | 10^9/L | 0.8-4.0 |
| 3 | Mid# | Mid-Cell Count (absolute) | 5905-5 (approx) | 10^9/L | 0.1-1.5 |
| 4 | Gran# | Granulocyte Count (absolute) | 770-8 (approx) | 10^9/L | 2.0-7.0 |
| 5 | Lymph% | Lymphocyte Percentage | 736-9 | % | 20.0-40.0 |
| 6 | Mid% | Mid-Cell Percentage | 5906-3 (approx) | % | 3.0-15.0 |
| 7 | Gran% | Granulocyte Percentage | 771-6 (approx) | % | 50.0-70.0 |
| 8 | RBC | Red Blood Cell Count | 789-8 | 10^12/L | 3.80-5.80 |
| 9 | HGB | Hemoglobin | 718-7 | g/dL | 12.0-17.0 |
| 10 | HCT | Hematocrit | 4544-3 | % | 36.0-52.0 |
| 11 | MCV | Mean Corpuscular Volume | 787-2 | fL | 80.0-100.0 |
| 12 | MCH | Mean Corpuscular Hemoglobin | 785-6 | pg | 27.0-34.0 |
| 13 | MCHC | Mean Corpusc. Hb Concentration | 786-4 | g/dL | 32.0-36.0 |
| 14 | RDW-CV | Red Cell Distribution Width (CV) | 788-0 | % | 11.0-16.0 |
| 15 | RDW-SD | Red Cell Distribution Width (SD) | 21000-5 | fL | 35.0-56.0 |
| 16 | PLT | Platelet Count | 777-3 | 10^9/L | 100-400 |
| 17 | MPV | Mean Platelet Volume | 32623-1 | fL | 6.5-12.0 |
| 18 | PDW | Platelet Distribution Width | 32207-3 | fL | 9.0-17.0 |
| 19 | PCT | Plateletcrit | 37874-4 | % | 0.10-0.50 |

**Note on test codes:** Mindray analyzers typically use their own local test codes (like `WBC`, `Lymph#`, `Mid%`) in OBX-3, NOT LOINC codes. Our middleware mapper will need to convert these local codes to LOINC codes for FHIR Observation resources.

### Mindray-Specific Implementation Notes

1. **Barcode/Sample ID:** The specimen barcode is typically sent in OBR-3 (Filler Order Number) or PID-3 (Patient ID Internal). The exact field depends on how the analyzer is configured. Some Mindray analyzers place the barcode in OBR-2 (Placer Order Number) when using bidirectional LIS communication.

2. **Units variation:** Mindray analyzers may use `10^9/L` or `10*9/L` or `x10^9/L` for the same unit. The middleware should normalize these.

3. **HL7 version:** Mindray uses HL7 v2.3.1. While the message structure is the same as v2.3 or v2.4 for our purposes, the MSH-12 field will show `2.3.1`.

4. **Encoding:** Mindray uses UTF-8 encoding. The MSH-18 field may say `UNICODE UTF-8` or may be empty (defaulting to ASCII, which is a subset of UTF-8).

5. **Bidirectional mode:** If configured for bidirectional communication, the Mindray BC-3510 can receive query messages from the middleware to download patient demographics and order information before running the test. However, for our initial implementation, we only need to receive results (unidirectional).

6. **Result flags:** Mindray analyzers use standard HL7 abnormal flags (H, L, HH, LL, N). They may also send analyzer-specific flags or comments in NTE segments for instrument-specific alerts (e.g., "Sample hemolyzed", "Platelet clumps detected").

---

## 9. Implementation Notes for Node.js

### Recommended Libraries

| Library | Purpose | Notes |
|---------|---------|-------|
| `node-hl7-server` | MLLP server (TCP) | Listed in project dependencies. Handles MLLP framing over TCP. |
| `hl7v2` (npm) | HL7v2 parser/serializer | Parses HL7 messages into structured objects. v1.7.0 is latest. |
| `serialport` | Serial port access | Listed in project dependencies. For RS-232 connections. |

### Parsing Strategy

**Step 1: MLLP Deframing**

For TCP, the MLLP server library handles framing. For serial, implement a buffer that watches for `0x0B` and `0x1C 0x0D`:

```typescript
// Pseudocode for serial MLLP deframing
class MLLPSerialParser {
  private buffer = Buffer.alloc(0);
  private inMessage = false;

  onData(chunk: Buffer): string | null {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Look for start byte
    const startIdx = this.buffer.indexOf(0x0B);
    if (startIdx !== -1) {
      this.inMessage = true;
      // Discard anything before start byte
      this.buffer = this.buffer.subarray(startIdx + 1);
    }

    if (!this.inMessage) return null;

    // Look for end sequence: 0x1C followed by 0x0D
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === 0x1C && this.buffer[i + 1] === 0x0D) {
        const message = this.buffer.subarray(0, i).toString('utf-8');
        this.buffer = this.buffer.subarray(i + 2);
        this.inMessage = false;
        return message;
      }
    }

    return null; // Message not yet complete
  }
}
```

**Step 2: Segment Splitting**

Split the raw message on `\r` (0x0D) to get individual segments:

```typescript
const segments = rawMessage.split('\r').filter(s => s.length > 0);
// segments[0] = "MSH|^~\&|..."
// segments[1] = "PID|1||..."
// segments[2] = "OBR|1||..."
// segments[3] = "OBX|1|NM|..."
// ...
```

**Step 3: Field Splitting**

Split each segment on `|` to get fields. Remember MSH is special — MSH-1 IS the pipe character itself:

```typescript
function parseSegment(segment: string): { id: string; fields: string[] } {
  const id = segment.substring(0, 3);

  if (id === 'MSH') {
    // MSH-1 is the | character itself
    // MSH-2 starts at position 4
    const fields = segment.substring(4).split('|');
    return { id, fields: ['|', ...fields] };
  }

  const fields = segment.substring(4).split('|');
  return { id, fields };
}
```

**Step 4: Component Splitting**

Fields that use the CE data type have components separated by `^`:

```typescript
// OBX-3: "WBC^White Blood Cells^L"
const components = field.split('^');
// components[0] = "WBC"         (code)
// components[1] = "White Blood Cells" (description)
// components[2] = "L"           (coding system)
```

### Key Parsing Gotchas

1. **MSH-1 is not a normal field.** The pipe character at position 3 of the MSH segment IS MSH-1 (the field separator), not a delimiter. When splitting MSH fields, start from position 4, and prepend `|` as MSH-1.

2. **Empty trailing fields are omitted.** A segment like `OBX|1|NM|WBC|||10*3/uL` may have fewer pipe characters than expected. Always check array bounds before accessing fields.

3. **OBX-5 data type depends on OBX-2.** If OBX-2 is `NM`, parse OBX-5 as a number. If OBX-2 is `CE`, parse OBX-5 as a coded entry with `^` separators. If OBX-2 is `ST` or `TX`, treat OBX-5 as plain text. Always check OBX-2 first.

4. **Multi-OBX messages.** A single ORU^R01 message can have 20+ OBX segments. Loop through all segments, not just the first one. Group OBX segments by their preceding OBR segment.

5. **Vendor deviations from the standard are common.**
   - Some analyzers put incorrect data in fields (e.g., text in a numeric field).
   - Some analyzers omit required fields.
   - Some analyzers use non-standard segment ordering.
   - Some analyzers send line feeds (`\n`) instead of carriage returns (`\r`) as segment terminators.
   - **Always be defensive in parsing. Never crash on malformed data. Log it and continue.**

6. **Reference range parsing.** OBX-7 is a string, not a structured type. It can contain:
   - `4.5-11.0` (simple range)
   - `< 200` (less than)
   - `> 0.5` (greater than)
   - `3.5 - 10.0` (with spaces)
   - `Negative` (text-based reference)
   - Empty (no reference range)

   The parser should handle all these gracefully.

7. **Character encoding.** Check MSH-18 for the character set. If empty, assume ASCII/UTF-8. If it says `UNICODE UTF-8` or `8859/1`, decode accordingly. For Mindray, UTF-8 is standard.

8. **Repeated fields.** Fields marked as repeating use the `~` separator. For example, OBX-8 could be `H~W` (High and Worse). Split on `~` when processing repeating fields.

9. **Segment groups.** OBX segments belong to the OBR segment above them. When parsing multiple OBR groups (multiple test panels), keep track of which OBR each OBX belongs to. A simple approach: iterate through segments in order, and when you see an OBR, start a new group.

10. **Timestamps.** HL7v2 timestamps can be truncated: `2026` (year only), `202603` (year-month), `20260305` (date), `20260305143000` (full), `20260305143000.0000` (with fractional seconds), `20260305143000+0400` (with timezone). Parse flexibly.

11. **ACK timing.** Send the ACK as soon as possible after receiving the message. Most analyzers have a timeout (typically 10-30 seconds). If the ACK is not received in time, the analyzer may retransmit the message or report an error.

12. **Building ACK messages.** When constructing the ACK, remember to:
    - Swap MSH-3/MSH-4 with MSH-5/MSH-6 (we are now the sender).
    - Set MSH-9 to `ACK^R01` or `ACK`.
    - Generate a new unique MSH-10 for the ACK.
    - Copy the original MSH-10 into MSA-2.
    - Wrap the ACK in MLLP framing before sending.

### Mapping Analyzer Test Codes to LOINC

Since analyzers send local codes, the middleware needs a mapping configuration. Here is a reference mapping for Mindray BC-3510 CBC parameters:

```typescript
const MINDRAY_BC3510_LOINC_MAP: Record<string, { loinc: string; display: string }> = {
  'WBC':     { loinc: '6690-2',  display: 'Leukocytes [#/volume] in Blood by Automated count' },
  'Lymph#':  { loinc: '731-0',   display: 'Lymphocytes [#/volume] in Blood by Automated count' },
  'Mid#':    { loinc: '5905-5',  display: 'Monocytes+Basophils+Eosinophils [#/volume] in Blood' },
  'Gran#':   { loinc: '770-8',   display: 'Neutrophils+Bands [#/volume] in Blood by Automated count' },
  'Lymph%':  { loinc: '736-9',   display: 'Lymphocytes/100 leukocytes in Blood by Automated count' },
  'Mid%':    { loinc: '5906-3',  display: 'Monocytes+Basophils+Eosinophils/100 leukocytes in Blood' },
  'Gran%':   { loinc: '771-6',   display: 'Neutrophils+Bands/100 leukocytes in Blood by Automated count' },
  'RBC':     { loinc: '789-8',   display: 'Erythrocytes [#/volume] in Blood by Automated count' },
  'HGB':     { loinc: '718-7',   display: 'Hemoglobin [Mass/volume] in Blood' },
  'HCT':     { loinc: '4544-3',  display: 'Hematocrit [Volume Fraction] of Blood by Automated count' },
  'MCV':     { loinc: '787-2',   display: 'MCV [Entitic volume] by Automated count' },
  'MCH':     { loinc: '785-6',   display: 'MCH [Entitic mass] by Automated count' },
  'MCHC':    { loinc: '786-4',   display: 'MCHC [Mass/volume] by Automated count' },
  'RDW-CV':  { loinc: '788-0',   display: 'Erythrocyte distribution width [Ratio] by Automated count' },
  'RDW-SD':  { loinc: '21000-5', display: 'Erythrocyte distribution width [Entitic volume]' },
  'PLT':     { loinc: '777-3',   display: 'Platelets [#/volume] in Blood by Automated count' },
  'MPV':     { loinc: '32623-1', display: 'Platelet mean volume [Entitic volume] in Blood' },
  'PDW':     { loinc: '32207-3', display: 'Platelet distribution width [Entitic volume]' },
  'PCT':     { loinc: '37874-4', display: 'Platelet crit [Volume Fraction] in Blood' },
};
```

### Mapping Abnormal Flags to FHIR Interpretation

```typescript
const FLAG_TO_FHIR_INTERPRETATION: Record<string, { code: string; display: string; system: string }> = {
  'N':  { code: 'N',   display: 'Normal',            system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
  'L':  { code: 'L',   display: 'Low',               system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
  'H':  { code: 'H',   display: 'High',              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
  'LL': { code: 'LL',  display: 'Critical low',      system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
  'HH': { code: 'HH',  display: 'Critical high',     system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
  'A':  { code: 'A',   display: 'Abnormal',          system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
  'AA': { code: 'AA',  display: 'Critical abnormal',  system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
  '':   { code: 'N',   display: 'Normal',            system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
};
```

### Mapping OBX-11 Status to FHIR Observation.status

```typescript
const STATUS_TO_FHIR: Record<string, string> = {
  'F': 'final',
  'P': 'preliminary',
  'C': 'corrected',
  'R': 'preliminary',  // Unverified -> treat as preliminary
  'I': 'registered',   // Pending -> registered
  'X': 'cancelled',    // Cannot obtain -> cancelled
  'D': 'entered-in-error', // Deleted
  'W': 'entered-in-error', // Wrong patient
};
```

---

## 10. Sources

### Official Standards and Specifications
- [HL7 MLLP Transport Specification](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=55) — HL7 International (Credibility: High)
- [HL7 v2.3.1 Observation Reporting (Chapter 7)](https://www.hl7.eu/HL7v2x/v231/std231/Ch7.html) — HL7 Europe mirror (Credibility: High)
- [MLLP Release 2 Specification](http://hl7.ihelse.net/hl7v3/infrastructure/transport/transport_mllp.html) — HL7 Norway mirror (Credibility: High)
- [OBX Segment Definition (v2+)](http://v2plus.hl7.org/2021Jan/segment-definition/OBX.html) — HL7 v2+ (Credibility: High)
- [OBR Segment Definition (v2+)](http://v2plus.hl7.org/2021Jan/segment-definition/OBR.html) — HL7 v2+ (Credibility: High)
- [MSH Segment Definition (v2+)](http://v2plus.hl7.org/2021Jan/segment-definition/MSH.html) — HL7 v2+ (Credibility: High)

### Reference Tools and Documentation
- [Rhapsody HL7 OBX Segment Reference](https://rhapsody.health/resources/hl7-obx-segment/) — Rhapsody Health (Credibility: High)
- [Rhapsody HL7 MSH Reference](https://rhapsody.health/resources/hl7-msh-message-header/) — Rhapsody Health (Credibility: High)
- [Rhapsody HL7 OBR Reference](https://rhapsody.health/resources/hl7-obr-segment/) — Rhapsody Health (Credibility: High)
- [Rhapsody HL7 PID Reference](https://rhapsody.health/resources/hl7-pid-segment/) — Rhapsody Health (Credibility: High)
- [Caristix HL7 Table 0078 (Abnormal Flags)](https://hl7-definition.caristix.com/v2/HL7v2.3/Tables/0078) — Caristix (Credibility: High)
- [HL7 Terminology Table 0085 (Result Status)](https://terminology.hl7.org/5.0.0/CodeSystem-v2-0085.html) — HL7 Terminology (Credibility: High)
- [ORU Message Overview](https://www.interfaceware.com/hl7-oru) — InterfaceWare (Credibility: High)
- [LLP Transport Overview](https://www.interfaceware.com/hl7-transport-llp) — InterfaceWare (Credibility: High)
- [HL7 ACK Guidance](https://confluence.hl7.org/display/CONF/HL7+V2+ACK+Guidance) — HL7 Confluence (Credibility: High)
- [ACK Message Overview](https://community.intersystems.com/post/quintessential-message-hl7v2-ack) — InterSystems (Credibility: Medium)

### LOINC Code References
- [LOINC 58410-2: CBC Panel](https://loinc.org/58410-2) — LOINC.org (Credibility: High)
- [LOINC 57021-8: CBC W Auto Differential Panel](https://loinc.org/57021-8) — LOINC.org (Credibility: High)
- [LOINC 718-7: Hemoglobin](https://loinc.org/718-7) — LOINC.org (Credibility: High)

### Mindray Analyzer Documentation
- [Mindray Patient Data Share Protocol Guide](https://www.mindray.com/content/dam/xpace/en_us/service-and-support/training-and-education/resource--library/technical--documents/operators-manuals-1/H-0010-20-43061-2-Mindray-Patient-Data-Share-Protocol-Programmers-Guide-v14_2-03-2020.pdf) — Mindray Official (Credibility: High)
- [BC-5380 LIS Protocol](https://pdfcoffee.com/bc-5380-lis-protocol-pdf-free.html) — Community-shared Mindray documentation (Credibility: Medium — unofficial source but real Mindray document)
- [BC-3600 Operator's Manual](https://keul.de/media/pdf/mindray/BC-3600_handbuch.pdf) — BC-3600 manual (same family as BC-3510) (Credibility: Medium)

### Node.js Libraries
- [hl7v2 (npm)](https://www.npmjs.com/package/hl7v2) — HL7v2 parser/serializer for Node.js (Credibility: Medium)
- [hl7-mllp (GitHub)](https://github.com/PantelisGeorgiadis/hl7-mllp) — MLLP implementation for Node.js (Credibility: Medium)
- [mllp-node (npm)](https://www.npmjs.com/package/mllp-node) — MLLP server for Node.js (Credibility: Medium)

### Other References
- [HL7 Serial Data Collection](https://www.aggsoft.com/serial-data-logger/tutorials/hl7.htm) — AGG Software (Credibility: Medium)
- [MLLP Overview (Medium)](https://medium.com/@ashusingh.gwl2019/clinical-data-exchange-hl72-over-mllp-f903261038b4) — Community article (Credibility: Low — for context only)
- [Oracle MLLP V2 Documentation](https://docs.oracle.com/cd/E19509-01/820-5508/ghadt/index.html) — Oracle (Credibility: High)

---

## Confidence Assessment

| Topic | Confidence | Notes |
|-------|-----------|-------|
| MLLP framing (0x0B/0x1C/0x0D) | **95%** | Well-documented standard, consistent across all sources |
| HL7v2 message structure | **95%** | Core standard, extremely well-documented |
| MSH segment fields | **95%** | Verified across multiple authoritative references |
| OBX segment fields and value types | **95%** | Official HL7 specification, multiple confirmations |
| Abnormal flags (Table 0078) | **90%** | Standard table, confirmed across sources |
| Result status codes (Table 0085) | **95%** | Official HL7 terminology, well-documented |
| ACK message structure | **90%** | Standard practice, multiple implementations confirmed |
| Mindray BC-3510 uses HL7 v2.3.1 | **85%** | Confirmed for Mindray hematology family, but specific BC-3510 docs not found publicly |
| Mindray test codes for CBC | **75%** | Based on BC-5380 (same family) and general Mindray patterns; exact BC-3510 codes need verification with actual analyzer |
| LOINC code mappings | **80%** | Standard LOINC codes for CBC, but exact codes used in output depend on analyzer configuration |

### What Would Increase Confidence
- Obtaining the actual Mindray BC-3510 Interface Specification document from the manufacturer
- Capturing real HL7 messages from the physical BC-3510 in the lab
- Testing the MLLP serial connection with the real hardware
