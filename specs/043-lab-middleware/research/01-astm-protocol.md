# ASTM E1381 / E1394 Protocol Reference

**Purpose:** Complete implementation reference for the ASTM laboratory analyzer communication protocol.
A developer should be able to implement this protocol from scratch using only this document.

**Standards covered:**
- **ASTM E1381-02** (now CLSI LIS01-A2) -- Low-level transport layer
- **ASTM E1394-97** (now CLSI LIS02-A2) -- High-level record/message layer

**Note:** These ASTM standards were withdrawn in 2002 and transferred to CLSI (Clinical and Laboratory Standards Institute), where they became LIS01-A2 and LIS02-A2 respectively. However, the industry universally still refers to them as "ASTM." The protocol itself is unchanged.

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [ASTM E1381 -- Transport Layer](#2-astm-e1381----transport-layer)
   - [Control Characters](#21-control-characters)
   - [The Three Phases](#22-the-three-phases)
   - [Frame Structure](#23-frame-structure)
   - [Checksum Calculation](#24-checksum-calculation)
   - [Frame Numbering](#25-frame-numbering)
   - [Timeout Values](#26-timeout-values)
   - [NAK Retry Behavior](#27-nak-retry-behavior)
   - [Contention Handling](#28-contention-handling)
   - [Receiver Interrupt](#29-receiver-interrupt)
   - [Transport State Machine](#210-transport-state-machine)
3. [ASTM E1394 -- Record Layer](#3-astm-e1394----record-layer)
   - [Delimiters](#31-delimiters)
   - [Record Types Overview](#32-record-types-overview)
   - [Hierarchical Structure](#33-hierarchical-structure)
   - [Header Record (H)](#34-header-record-h)
   - [Patient Record (P)](#35-patient-record-p)
   - [Order Record (O)](#36-order-record-o)
   - [Result Record (R)](#37-result-record-r)
   - [Comment Record (C)](#38-comment-record-c)
   - [Query Record (Q)](#39-query-record-q)
   - [Terminator Record (L)](#310-terminator-record-l)
   - [Manufacturer Record (M)](#311-manufacturer-record-m)
   - [Scientific Record (S)](#312-scientific-record-s)
   - [Multi-Frame Messages](#313-multi-frame-messages)
4. [Real Message Examples](#4-real-message-examples)
   - [Example 1: Hematology CBC (Sysmex XP)](#41-example-1-hematology-cbc-sysmex-xp)
   - [Example 2: Clinical Chemistry](#42-example-2-clinical-chemistry)
   - [Example 3: Host Query for Orders](#43-example-3-host-query-for-orders)
5. [Implementation Notes for Node.js/TypeScript](#5-implementation-notes-for-nodejstypescript)
   - [State Machine Implementation](#51-state-machine-implementation)
   - [Key Gotchas and Edge Cases](#52-key-gotchas-and-edge-cases)
   - [Vendor Quirks](#53-vendor-quirks-common-deviations)
   - [Recommended Architecture](#54-recommended-architecture)

---

## 1. Protocol Overview

Think of ASTM like a letter delivery system with two layers:

- **E1381 (Transport Layer)** is like the postal service -- it handles the envelope, delivery confirmation, and "please re-send" if a letter gets lost. It does not care what is inside.
- **E1394 (Record Layer)** is the letter content -- it defines the format of patient info, test orders, and results inside the envelope.

The transport layer uses a **simplex stop-and-wait** protocol: information flows in one direction at a time, and the sender waits for acknowledgment of each frame before sending the next.

**Physical connection:** RS-232 serial (DB-9 or DB-25) or TCP/IP socket. Default serial settings: **9600 baud, 8 data bits, no parity, 1 stop bit (8-N-1)**.

---

## 2. ASTM E1381 -- Transport Layer

### 2.1 Control Characters

All control characters are from the 7-bit ASCII set (ANSI X3.4):

| Character | ASCII Name | Decimal | Hex    | Description |
|-----------|-----------|---------|--------|-------------|
| `<ENQ>`   | Enquiry   | 5       | `0x05` | "I want to send data" -- initiates establishment phase |
| `<ACK>`   | Acknowledge | 6     | `0x06` | "OK, go ahead" -- positive acknowledgment |
| `<NAK>`   | Negative Ack | 21   | `0x15` | "Not ready" or "Bad frame, send again" |
| `<STX>`   | Start of Text | 2   | `0x02` | Start of a data frame |
| `<ETX>`   | End of Text | 3     | `0x03` | End of the **last** frame in a message |
| `<ETB>`   | End of Block | 23   | `0x17` | End of an **intermediate** frame (more frames coming) |
| `<EOT>`   | End of Transmission | 4 | `0x04` | "I am done sending" -- terminates the session |
| `<CR>`    | Carriage Return | 13 | `0x0D` | Part of frame trailer |
| `<LF>`    | Line Feed | 10      | `0x0A` | Part of frame trailer |

**Critical distinction: ETX vs ETB**
- **ETX** (0x03) = "This is the last frame of the current message." The message is complete.
- **ETB** (0x17) = "This is an intermediate frame. More frames are coming for the same message." The receiver should buffer and wait for the next frame.

### 2.2 The Three Phases

Every ASTM communication session has three phases, like a phone call:

```
Phase 1: ESTABLISHMENT (pick up the phone, say hello)
Phase 2: TRANSFER      (have the conversation -- send frames, get ACKs)
Phase 3: TERMINATION   (hang up)
```

#### Phase 1: Establishment (Link Connection)

The sender requests permission to transmit by sending `<ENQ>`. The receiver responds:

```
Sender                          Receiver
  |                                |
  |──── <ENQ> ────────────────────>|   "I want to send"
  |                                |
  |<─── <ACK> ────────────────────|   "Go ahead" (ready)
  |                                |   → Proceed to Transfer Phase

  OR

  |<─── <NAK> ────────────────────|   "Not ready / busy"
  |                                |   → Sender waits >= 10 sec, retries ENQ

  OR

  |     (no response)              |   → 15 second timeout
  |                                |   → Sender enters Termination Phase
```

**Rules for Establishment:**
- If the receiver sends `<ACK>`, the sender proceeds to Transfer Phase
- If the receiver sends `<NAK>`, the sender waits at least **10 seconds** then retries `<ENQ>`
- If no response within **15 seconds**, the sender times out and enters Termination Phase
- If the receiver sends anything other than `<ACK>`, `<NAK>`, or `<ENQ>`, the sender enters Termination Phase

#### Phase 2: Transfer

The sender transmits data frames one at a time, waiting for acknowledgment after each:

```
Sender                          Receiver
  |                                |
  |──── [Frame 1] ───────────────>|   STX + data + ETB + checksum + CRLF
  |<─── <ACK> ────────────────────|   "Got it, send next"
  |                                |
  |──── [Frame 2] ───────────────>|   STX + data + ETX + checksum + CRLF
  |<─── <ACK> ────────────────────|   "Got it" (ETX = last frame)
  |                                |
  |──── <EOT> ───────────────────>|   "I am done sending"
  |                                |   → Both sides return to Neutral
```

**Rules for Transfer:**
- After sending a frame, the sender waits up to **15 seconds** for `<ACK>` or `<NAK>`
- If the receiver does not respond within **15 seconds**, the sender aborts and enters Termination Phase
- If the receiver does not receive a frame or `<EOT>` within **30 seconds**, it considers the session timed out and returns to Neutral state
- On `<ACK>`: send next frame (or `<EOT>` if done)
- On `<NAK>`: retransmit the same frame (up to 6 attempts per frame)

#### Phase 3: Termination (Link Release)

The sender transmits `<EOT>` to release the connection:

```
Sender                          Receiver
  |                                |
  |──── <EOT> ───────────────────>|   "Session complete"
  |                                |
  Both sides return to NEUTRAL state
```

- The sender transmits `<EOT>` and immediately regards the link as neutral
- The receiver, upon receiving `<EOT>`, also returns to neutral state
- No acknowledgment of `<EOT>` is required or expected
- After termination, either side may initiate a new session

### 2.3 Frame Structure

A frame is the unit of data transmitted during the Transfer Phase. Its structure is:

```
<STX> [FN] [DATA...] <ETX or ETB> [C1][C2] <CR> <LF>
```

| Component | Size | Description |
|-----------|------|-------------|
| `<STX>`   | 1 byte | Start of frame marker (0x02). NOT included in checksum. |
| `FN`      | 1 byte | Frame number: ASCII '0' through '7' (0x30-0x37). Included in checksum. |
| `DATA`    | 0-240 bytes | The actual message content. Included in checksum. |
| `<ETX>` or `<ETB>` | 1 byte | End marker (0x03 or 0x17). Included in checksum. |
| `C1`      | 1 byte | Checksum high nibble as ASCII hex char. NOT included in checksum. |
| `C2`      | 1 byte | Checksum low nibble as ASCII hex char. NOT included in checksum. |
| `<CR>`    | 1 byte | Carriage return (0x0D). NOT included in checksum. |
| `<LF>`    | 1 byte | Line feed (0x0A). NOT included in checksum. |

**Maximum frame size:** 247 bytes total (including all overhead: STX + FN + DATA + ETX/ETB + C1 + C2 + CR + LF). This means the DATA portion can be at most **240 bytes**.

**If a message exceeds 240 bytes**, it must be split across multiple frames:
- All frames except the last use `<ETB>` as the terminator
- The last frame uses `<ETX>` as the terminator
- The data is simply split at the 240-byte boundary (it can split in the middle of a field)

### 2.4 Checksum Calculation

The checksum is the most error-prone part of ASTM implementation. Here is the exact algorithm:

**Algorithm:**
1. Initialize a running sum to 0
2. Starting with the frame number (the byte AFTER `<STX>`), add each byte's numeric value to the sum
3. Continue adding through the `<ETX>` or `<ETB>` byte (inclusive)
4. Take the sum modulo 256 (keep only the least significant 8 bits)
5. Convert the result to a 2-character uppercase hexadecimal string
6. If the hex string is only 1 character, pad with a leading '0'

**What is included in the checksum:** Frame number + all data bytes + ETX or ETB
**What is NOT included:** STX, the checksum characters themselves, CR, LF

**TypeScript implementation:**

```typescript
function calculateChecksum(frameContent: string): string {
  // frameContent should be everything AFTER <STX> and BEFORE the checksum
  // i.e., it includes: frame_number + data + ETX_or_ETB
  let sum = 0;
  for (let i = 0; i < frameContent.length; i++) {
    sum += frameContent.charCodeAt(i);
  }
  const checksum = sum % 256; // mod 256 = keep least significant byte
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

// Example: frame "1H|\^&|||Host|||||||LIS2-A2|20210101120000\r\x03"
// The \r (0x0D) is the record terminator CR within the data
// The \x03 is ETX
// Sum all byte values from '1' through ETX, mod 256, to hex
```

**Worked example:**

Given a frame containing: `<STX>` `1` `H` `|` `\` `^` `&` `<CR>` `<ETX>`

```
Byte:   '1'  'H'  '|'  '\'  '^'  '&'  CR   ETX
Dec:     49   72  124   92   94   38   13    3
Sum:     49 + 72 + 124 + 92 + 94 + 38 + 13 + 3 = 485
Mod 256: 485 % 256 = 229
Hex:     229 = 0xE5
Result:  "E5"
```

The transmitted frame would be: `<STX>` `1` `H|\^&` `<CR>` `<ETX>` `E` `5` `<CR>` `<LF>`

**Important:** The `<CR>` (0x0D) that appears at the end of each record (as the ASTM record terminator) IS part of the data and IS included in the checksum. The `<CR><LF>` at the very end of the frame (after the checksum) is NOT included.

### 2.5 Frame Numbering

Frame numbers prevent duplicate frame processing during retransmission:

- Frame numbers cycle through: **1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, ...** (starts at 1, wraps after 7 to 0)
- The frame number is a single ASCII digit character ('0' through '7', i.e., 0x30 through 0x37)
- Each new frame increments the frame number
- On retransmission (after NAK), the **same** frame number is used
- The receiver uses the frame number to detect duplicates -- if it receives the same frame number twice in a row, it knows the sender retransmitted

**Implementation note:** Some analyzers start at 0 instead of 1. Be tolerant of this.

### 2.6 Timeout Values

These are the timeouts specified by the standard. In your implementation, you should use these as defaults but make them configurable:

| Situation | Timeout | What Happens on Timeout |
|-----------|---------|------------------------|
| Sender waiting for response to `<ENQ>` | **15 seconds** | Sender enters Termination Phase (sends `<EOT>`) |
| Receiver waiting for `<ENQ>` after contention detected | **20 seconds** | Receiver returns to Neutral state |
| Sender waiting for `<ACK>/<NAK>` after sending a frame | **15 seconds** | Sender aborts and enters Termination Phase |
| Receiver waiting for next frame or `<EOT>` | **30 seconds** | Receiver considers session over, returns to Neutral |
| Sender after receiving `<NAK>` to `<ENQ>` (busy) | **>= 10 seconds** wait | Sender waits then retries `<ENQ>` |
| Instrument after contention (resend `<ENQ>`) | **>= 1 second** wait | Instrument (priority side) retries `<ENQ>` |

### 2.7 NAK Retry Behavior

When the receiver sends `<NAK>` in response to a data frame, it means the frame was received but was corrupted (bad checksum, invalid frame number, etc.):

1. The sender increments a per-frame retry counter
2. The sender retransmits the **same frame** with the **same frame number**
3. If the retry counter reaches **6** (i.e., the frame has been sent 6 times without success), the sender **aborts the entire message**
4. On abort, the sender enters Termination Phase (sends `<EOT>`)
5. The aborted message should be queued for later retry at the application level

**Important:** The 6-retry limit applies **per frame**, not per session. Each frame gets 6 attempts.

### 2.8 Contention Handling

Contention occurs when both sides try to send `<ENQ>` at the same time (both want to talk simultaneously). The standard resolves this with a priority system:

**Rule: The instrument (analyzer) always has priority over the computer (host/LIS).**

When contention is detected:

```
Instrument                      Computer (Host/LIS)
  |                                |
  |──── <ENQ> ────────────────────>|
  |<──── <ENQ> ───────────────────|   ← CONTENTION! Both sent ENQ
  |                                |
  Computer detects contention:     |
  - Stop its own transmission      |
  - Prepare to RECEIVE             |
  - Send <ACK> to instrument       |
  |                                |
  |<─── <ACK> ────────────────────|   Computer yields to instrument
  |                                |
  Instrument proceeds to send data |
```

**Contention detection from the computer's perspective:**
1. Computer sends `<ENQ>` and receives `<ENQ>` back (instead of `<ACK>`)
2. Computer must stop its transmission attempt
3. Computer sends `<ACK>` to the instrument
4. Instrument sends its data
5. After the instrument finishes (sends `<EOT>`), the computer may retry its `<ENQ>` after a **20-second** wait

**Contention detection from the instrument's perspective:**
1. Instrument sends `<ENQ>` and receives `<ENQ>` back
2. Instrument waits **at least 1 second**, then resends `<ENQ>`
3. The computer should have yielded by now and will respond with `<ACK>`

### 2.9 Receiver Interrupt

The receiver can interrupt the sender to take over and send its own data. Instead of sending `<ACK>` after receiving a frame, the receiver sends `<EOT>`:

```
Sender                          Receiver
  |                                |
  |──── [Frame N] ───────────────>|
  |<─── <EOT> ────────────────────|   ← Receiver interrupt!
  |                                |
  Sender MUST:                     |
  1. Stop sending                  |
  2. Enter Termination Phase       |
  3. Wait >= 15 seconds            |
  (Receiver can now send ENQ       |
   and become the sender)          |
```

**Important:** The sender is not required to honor the interrupt immediately -- the standard says the sender "does not have to stop transmitting" after receiving the interrupt request. If the sender ignores it, the receiver must re-request the interrupt with the next frame's acknowledgment. However, for good behavior, the implementation should honor interrupts promptly.

### 2.10 Transport State Machine

The transport layer can be modeled as a state machine with these states:

```
                         ┌──────────────────────────────────┐
                         │                                  │
                    ┌────▼─────┐                            │
     ┌──────────── │  NEUTRAL  │ ◄──────────────┐           │
     │             └────┬──────┘                │           │
     │                  │                       │           │
     │        Send ENQ  │  Receive ENQ          │           │
     │                  │                       │           │
     ▼                  ▼                       │           │
┌─────────────┐   ┌──────────────┐              │           │
│ ESTABLISHING│   │ EST_RECEIVING│              │           │
│ (as sender) │   │ (as receiver)│              │           │
└──────┬──────┘   └──────┬───────┘              │           │
       │                 │                      │           │
  Rcv ACK           Send ACK                   │           │
       │                 │                      │           │
       ▼                 ▼                      │           │
┌─────────────┐   ┌──────────────┐         Send/Rcv EOT    │
│ TRANSFERRING│   │  RECEIVING   │──────────────┘           │
│ (sending)   │   │  (frames)    │                          │
└──────┬──────┘   └──────────────┘                          │
       │                                                    │
  Send EOT ─────────────────────────────────────────────────┘
```

**States:**

| State | Description | Transitions |
|-------|-------------|-------------|
| **NEUTRAL** | Idle. Neither side is sending. | Send ENQ -> ESTABLISHING; Receive ENQ -> EST_RECEIVING |
| **ESTABLISHING** | We sent ENQ, waiting for ACK/NAK. | Receive ACK -> TRANSFERRING; Receive NAK -> (wait, retry ENQ); Timeout -> NEUTRAL (via EOT) |
| **EST_RECEIVING** | We received ENQ, deciding whether to accept. | Send ACK -> RECEIVING; Send NAK -> NEUTRAL |
| **TRANSFERRING** | We are actively sending frames. | Send frame, receive ACK -> send next / send EOT; Receive NAK -> retransmit; Send EOT -> NEUTRAL |
| **RECEIVING** | We are receiving frames from the sender. | Receive frame -> send ACK; Receive EOT -> NEUTRAL; Timeout -> NEUTRAL |

---

## 3. ASTM E1394 -- Record Layer

The record layer defines the structure of the message content that rides inside the transport frames. Think of it as the "language" spoken inside the "envelope."

### 3.1 Delimiters

ASTM E1394 uses four special characters to structure data within records. These are defined in the Header record but almost universally use these defaults:

| Delimiter | Default Character | Purpose | Example |
|-----------|-------------------|---------|---------|
| **Field separator** | `\|` (pipe, 0x7C) | Separates fields within a record | `R\|1\|^^^WBC\|7.5\|` |
| **Component separator** | `^` (caret, 0x5E) | Separates components within a field | `Smith^John^M` |
| **Repeat separator** | `\` (backslash, 0x5C) | Separates repeated values in a field | `^^^WBC\^^^RBC\^^^HGB` |
| **Escape character** | `&` (ampersand, 0x26) | Escapes special characters in text | `&F&` = literal pipe |

**Escape sequences:**
- `&F&` = literal field separator (pipe)
- `&S&` = literal component separator (caret)
- `&R&` = literal repeat separator (backslash)
- `&E&` = literal escape character (ampersand)

**Record terminator:** Each record ends with `<CR>` (0x0D). This CR is part of the data content -- it is included in checksum calculations and can appear inside a frame's data section.

**Delimiter declaration:** The Header record declares delimiters in a specific format. Given the standard defaults, the Header always starts with:
```
H|\^&
```
This means: field sep = `|`, component sep = `\`, repeat sep = `^`, escape = `&`. (Yes, this is confusing -- the first `|` is the field separator itself, then `\^&` declares the other three. Some implementations swap the roles of `\` and `^`.)

**CRITICAL NOTE:** Some analyzer manufacturers swap the component and repeat separators, using `^` for repeats and `\` for components. The delimiter declaration in the Header record is the authoritative source -- always parse it, never assume defaults.

### 3.2 Record Types Overview

| Type | Name | Section in E1394 | Purpose |
|------|------|-------------------|---------|
| **H** | Header | 6 | First record in every message. Identifies sender, declares delimiters. |
| **P** | Patient | 7 | Patient demographics (ID, name, DOB, sex). |
| **O** | Order | 8 | Test order / specimen info (sample ID, tests requested, priority). |
| **R** | Result | 9 | Individual test result (value, units, reference range, flags). |
| **C** | Comment | 10 | Free-text comment attached to preceding P, O, or R record. |
| **Q** | Request/Query | 11 | Query from instrument to host for pending orders. |
| **L** | Terminator | 12 | Last record in every message. Signals message end. |
| **M** | Manufacturer | 13 | Manufacturer-specific data (not standardized). |
| **S** | Scientific | 14 | Scientific/analytical data (method info, calibration). |

### 3.3 Hierarchical Structure

ASTM messages follow a strict hierarchy. Records are nested:

```
H  ─── Header (exactly 1 per message, always first)
│
├── P  ─── Patient (0 or more)
│   │
│   ├── C  ─── Comment on patient (0 or more)
│   │
│   ├── O  ─── Order (0 or more per patient)
│   │   │
│   │   ├── C  ─── Comment on order (0 or more)
│   │   │
│   │   ├── R  ─── Result (0 or more per order)
│   │   │   │
│   │   │   └── C  ─── Comment on result (0 or more)
│   │   │
│   │   └── R  ─── More results...
│   │
│   └── O  ─── More orders...
│
├── P  ─── More patients...
│
└── L  ─── Terminator (exactly 1, always last)
```

**A typical result-reporting message flows as:**
```
H → P → O → R → R → R → ... → L
```

For multiple patients:
```
H → P → O → R → R → P → O → R → R → R → L
```

**Important:** Patient records are optional. Many analyzers send results without patient demographics:
```
H → O → R → R → R → L
```

### 3.4 Header Record (H)

The Header record identifies the message sender and declares delimiters. It has 14 fields.

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | H.1 | Record Type ID | Always `H` |
| 2 | H.2 | Delimiter Definition | Three chars after the first field separator: component, repeat, escape. E.g., `\^&` |
| 3 | H.3 | Message Control ID | Unique message identifier (optional) |
| 4 | H.4 | Access Password | Password for access control (rarely used) |
| 5 | H.5 | Sender Name/ID | Identifies the sending system. Components: `Name^Version^Serial^...` |
| 6 | H.6 | Sender Street Address | Address of sender (rarely used) |
| 7 | H.7 | Reserved | Reserved field |
| 8 | H.8 | Sender Phone Number | Phone of sender (rarely used) |
| 9 | H.9 | Sender Characteristics | Characteristics of sending system |
| 10 | H.10 | Receiver ID | Identifies the intended receiver |
| 11 | H.11 | Comment/Special Instructions | Free text comment |
| 12 | H.12 | Processing ID | `P` = Production, `T` = Training, `D` = Debugging, `Q` = Quality Control |
| 13 | H.13 | Version Number | Protocol version, e.g., `E1394-97` or `LIS2-A2` |
| 14 | H.14 | Date/Time of Message | Format: `YYYYMMDDHHMMSS` |

**Example:**
```
H|\^&|||Sysmex XP-100^00-00^^^^Sysmex XP-100 01^12345678||||||||E1394-97|20240115143022
```

Breakdown:
- `H` -- Record type
- `|\^&` -- Delimiters (pipe=field, backslash=component, caret=repeat, ampersand=escape)
- `|||` -- Fields 3, 4 empty
- `Sysmex XP-100^00-00^^^^Sysmex XP-100 01^12345678` -- Sender name with components
- `||||||||` -- Fields 6-11 empty
- `E1394-97` -- Version
- `20240115143022` -- Timestamp

### 3.5 Patient Record (P)

The Patient record contains demographics. It has up to 35 fields, but most implementations use only a small subset.

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | P.1 | Record Type ID | Always `P` |
| 2 | P.2 | Sequence Number | Sequential integer (1, 2, 3, ...) for multiple patients |
| 3 | P.3 | Practice-Assigned Patient ID | Facility/practice patient identifier |
| 4 | P.4 | Laboratory-Assigned Patient ID | Lab-specific patient ID |
| 5 | P.5 | Patient ID Number 3 | Third ID (e.g., national ID, SSN) |
| 6 | P.6 | Patient Name | Format: `Last^First^Middle^Suffix^Title` |
| 7 | P.7 | Mother's Maiden Name | Mother's maiden name |
| 8 | P.8 | Birthdate | Format: `YYYYMMDD` |
| 9 | P.9 | Patient Sex | `M` = Male, `F` = Female, `U` = Unknown |
| 10 | P.10 | Patient Race-Ethnic Origin | Race/ethnicity code |
| 11 | P.11 | Patient Address | Street address |
| 12 | P.12 | Reserved | Reserved field |
| 13 | P.13 | Patient Phone Number | Phone number |
| 14 | P.14 | Attending Physician | Format: `ID^Last^First^Middle^Suffix` |
| 15 | P.15 | Special Field 1 | User-defined |
| 16 | P.16 | Special Field 2 | User-defined |
| 17 | P.17 | Patient Height | Height value |
| 18 | P.18 | Patient Weight | Weight value |
| 19 | P.19 | Known Diagnosis | Diagnosis code or text |
| 20 | P.20 | Active Medications | Current medications |
| 21 | P.21 | Patient Diet | Diet information |
| 22 | P.22 | Practice Field 1 | Practice-specific |
| 23 | P.23 | Practice Field 2 | Practice-specific |
| 24 | P.24 | Admission/Discharge Dates | Date range |
| 25 | P.25 | Admission Status | Admission status code |
| 26 | P.26 | Location | Patient location/ward |
| 27-35 | P.27-P.35 | Reserved/Vendor-Specific | Additional fields (rarely used) |

**Example:**
```
P|1||Patient001||Doe^John^A||19850315|M
```

### 3.6 Order Record (O)

The Order record describes a test order or specimen. It has up to 31 fields.

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | O.1 | Record Type ID | Always `O` |
| 2 | O.2 | Sequence Number | Sequential integer (1, 2, 3, ...) |
| 3 | O.3 | Specimen ID | Specimen identifier (often the barcode). Components: `ID1^ID2^ID3^...` |
| 4 | O.4 | Instrument Specimen ID | Instrument's internal specimen ID |
| 5 | O.5 | Universal Test ID | Test code(s). Format: `^^^TestCode^Protocol`. Use repeat separator for multiple tests: `^^^WBC\^^^RBC\^^^HGB` |
| 6 | O.6 | Priority | `S` = Stat/Urgent, `R` = Routine, `A` = ASAP |
| 7 | O.7 | Requested/Ordered Date/Time | When test was ordered: `YYYYMMDDHHMMSS` |
| 8 | O.8 | Specimen Collection Date/Time | When specimen was collected |
| 9 | O.9 | Collection End Date/Time | End of collection period |
| 10 | O.10 | Collection Volume | Volume of specimen collected |
| 11 | O.11 | Collector ID | Who collected the specimen |
| 12 | O.12 | Action Code | `A` = Add, `C` = Cancel, `N` = New |
| 13 | O.13 | Danger Code | Hazard info (e.g., biohazard) |
| 14 | O.14 | Relevant Clinical Info | Clinical notes |
| 15 | O.15 | Date/Time Specimen Received | When lab received specimen |
| 16 | O.16 | Specimen Descriptor | Specimen type: e.g., `BLOOD`, `URINE`, `SERUM`, `PLASMA` |
| 17 | O.17 | Ordering Physician | Format: `ID^Last^First` |
| 18 | O.18 | Physician Phone Number | Ordering physician's phone |
| 19 | O.19 | User Field 1 | User-defined |
| 20 | O.20 | User Field 2 | User-defined |
| 21 | O.21 | Lab Field 1 | Lab-specific |
| 22 | O.22 | Lab Field 2 | Lab-specific |
| 23 | O.23 | Date/Time Results Reported | When results were reported: `YYYYMMDDHHMMSS` |
| 24 | O.24 | Instrument Charge | Billing instrument code |
| 25 | O.25 | Instrument Section ID | Which section/module of instrument |
| 26 | O.26 | Report Type | `O` = Order, `F` = Final, `X` = Cancelled, `I` = Pending, `R` = Revised, `P` = Preliminary, `Q` = Query |
| 27 | O.27 | Reserved | Reserved |
| 28 | O.28 | Location/Ward of Specimen Collection | Where specimen was collected |
| 29 | O.29 | Nosocomial Infection Flag | Infection flag |
| 30 | O.30 | Specimen Service | Service code |
| 31 | O.31 | Specimen Institution | Institution code |

**Example (Sysmex XP hematology order):**
```
O|1||^^12345ABCDE^B|^^^^WBC\^^^^RBC\^^^^HGB\^^^^HCT\^^^^MCV\^^^^MCH\^^^^MCHC\^^^^PLT||||||||||||||||||F
```

Breakdown:
- `O|1|` -- Order record, sequence 1
- `|^^12345ABCDE^B|` -- Specimen ID: barcode `12345ABCDE`, tube type `B` (blood)
- `^^^^WBC\^^^^RBC\^^^^HGB\...` -- Tests requested: WBC, RBC, HGB, HCT, MCV, MCH, MCHC, PLT
- `F` at position 26 -- Report type: Final

### 3.7 Result Record (R)

The Result record contains individual test results. This is the most important record for our middleware. It has 14 fields.

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | R.1 | Record Type ID | Always `R` |
| 2 | R.2 | Sequence Number | Sequential integer (1, 2, 3, ...) within the parent Order |
| 3 | R.3 | Universal Test ID | Test identifier. Format: `^^^TestCode^Protocol` or `^^^TestCode` |
| 4 | R.4 | Data/Measurement Value | The result value (numeric or text). E.g., `7.5`, `Positive`, `***.*` (error) |
| 5 | R.5 | Units | Units of measurement. E.g., `10*3/uL`, `g/dL`, `mmol/L`, `mg/dL` |
| 6 | R.6 | Reference Ranges | Normal range. Format: `low-high` or `low to high`. E.g., `4.5-11.0`, `12.0-16.0` |
| 7 | R.7 | Result Abnormal Flags | Abnormality indicator (see table below) |
| 8 | R.8 | Nature of Abnormality Testing | `N` = Normal, `A` = Abnormal, `VS` = Very Abnormal (critical) |
| 9 | R.9 | Result Status | Status of the result (see table below) |
| 10 | R.10 | Date of Change in Instrument Normative Values | When reference ranges last changed |
| 11 | R.11 | Operator Identification | ID of the operator/technician |
| 12 | R.12 | Date/Time Test Started | When the test began: `YYYYMMDDHHMMSS` |
| 13 | R.13 | Date/Time Test Completed | When the test finished: `YYYYMMDDHHMMSS` |
| 14 | R.14 | Instrument Identification | Which instrument produced the result |

**Abnormal Flag values (R.7):**

| Flag | Meaning |
|------|---------|
| `L`  | Below low normal |
| `H`  | Above high normal |
| `LL` | Below panic/critical low (very low) |
| `HH` | Above panic/critical high (very high) |
| `<`  | Below absolute low (instrument limit) |
| `>`  | Above absolute high (instrument limit) |
| `N`  | Normal |
| `A`  | Abnormal (non-directional) |
| `U`  | Significant change up (delta check) |
| `D`  | Significant change down (delta check) |
| `B`  | Better (compared to previous result) |
| `W`  | Worse (compared to previous result) |

**Result Status values (R.9):**

| Code | Meaning |
|------|---------|
| `F`  | Final result (verified, will not change) |
| `P`  | Preliminary result (may be revised) |
| `R`  | Result previously transmitted; now revised |
| `C`  | Correction of previously transmitted result |
| `I`  | Result pending (instrument is still working) |
| `S`  | Partial result (some components incomplete) |
| `X`  | Result cancelled; order remains |
| `Y`  | No result available; order cancelled |
| `Q`  | Response to query; result stored but not verified |

**Example (WBC result from hematology):**
```
R|1|^^^^WBC^26|78|10*2/uL||N||||123456789012345||20240115163530
```

Breakdown:
- `R|1|` -- Result record, sequence 1
- `^^^^WBC^26` -- Test ID: WBC with protocol code 26
- `78` -- Result value: 78 (in units 10^2/uL = 7,800/uL = 7.8 x 10^3/uL)
- `10*2/uL` -- Units
- (empty field) -- Reference range (not provided by this analyzer)
- `N` -- Normal flag
- `123456789012345` -- Operator ID
- `20240115163530` -- Test completed Jan 15, 2024, 4:35:30 PM

### 3.8 Comment Record (C)

The Comment record provides free-text annotations. It attaches to whichever record precedes it (P, O, or R). It has 5 fields.

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | C.1 | Record Type ID | Always `C` |
| 2 | C.2 | Sequence Number | Sequential integer (1, 2, 3, ...) |
| 3 | C.3 | Comment Source | `L` = Lab, `I` = Instrument, `P` = Practice/Physician, `O` = Other |
| 4 | C.4 | Comment Text | Free-text comment. Can be coded: `Code^Description` |
| 5 | C.5 | Comment Type | `G` = Generic/free text, `I` = Information, `P` = Positive/abnormal, `N` = Negative/normal |

**Example (instrument flag comment on a result):**
```
C|1|I|Result flagged: Possible lipemia interference^LIPEMIA|G
```

### 3.9 Query Record (Q)

The Query (Request Information) record is used by the instrument to ask the host for pending orders. This is essential for bidirectional communication. It has 13 fields.

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | Q.1 | Record Type ID | Always `Q` |
| 2 | Q.2 | Sequence Number | Sequential integer (1, 2, 3, ...) |
| 3 | Q.3 | Starting Range ID | Start of the range to query (specimen ID or patient ID) |
| 4 | Q.4 | Ending Range ID | End of the range (same as Q.3 for single specimen query) |
| 5 | Q.5 | Universal Test ID | Test code to query for (empty = all tests) |
| 6 | Q.6 | Nature of Request Time Limits | `S` = Stat, `R` = Routine, `T` = Timed |
| 7 | Q.7 | Beginning Request Results Date/Time | Start of date range |
| 8 | Q.8 | Ending Request Results Date/Time | End of date range |
| 9 | Q.9 | Requesting Physician | Physician ID |
| 10 | Q.10 | Requesting Physician Phone | Phone number |
| 11 | Q.11 | User Field 1 | User-defined |
| 12 | Q.12 | User Field 2 | User-defined |
| 13 | Q.13 | Request Information Status | `O` = Order, `P` = Pending, `D` = Demographics, `A` = All |

**Example (instrument querying host for orders on specimen 2009061124):**
```
Q|1|^2009061124||^^^ALL||||||||O
```

Breakdown:
- `Q|1|` -- Query record, sequence 1
- `^2009061124` -- Starting range: specimen ID 2009061124
- (empty) -- Ending range same as starting
- `^^^ALL` -- All tests
- `O` at position 13 -- Requesting order information

**Typical bidirectional flow:**
```
Instrument → Host:  H|...<CR>  Q|1|^BARCODE123||^^^ALL||||||||O<CR>  L|1|N<CR>
Host → Instrument:  H|...<CR>  P|1|...<CR>  O|1||BARCODE123|...<CR>  L|1|N<CR>
```

### 3.10 Terminator Record (L)

The Terminator record marks the end of a message. It has 3 fields.

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | L.1 | Record Type ID | Always `L` |
| 2 | L.2 | Sequence Number | Always `1` (there is only ever one terminator) |
| 3 | L.3 | Termination Code | `N` = Normal termination, `T` = Sender aborted, `Q` = Error in last request, `I` = No information available, `F` = Last request processed |

**Example:**
```
L|1|N
```

### 3.11 Manufacturer Record (M)

The Manufacturer record allows instrument vendors to include proprietary data. The standard does not define specific fields beyond the basics:

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | M.1 | Record Type ID | Always `M` |
| 2 | M.2 | Sequence Number | Sequential integer |
| 3+ | M.3+ | Manufacturer-Defined | Vendor-specific fields (varies by manufacturer) |

**Note:** The content of M records is entirely manufacturer-defined. You must consult each analyzer's interface specification to know what data is included. In practice, many analyzers do not send M records.

### 3.12 Scientific Record (S)

The Scientific record contains analytical/methodology information. Like M records, these are rarely used in practice:

| Field | Position | Name | Description |
|-------|----------|------|-------------|
| 1 | S.1 | Record Type ID | Always `S` |
| 2 | S.2 | Sequence Number | Sequential integer |
| 3 | S.3 | Analytical Method | Method used for analysis |
| 4 | S.4 | Instrumentation | Instrument details |
| 5 | S.5 | Reagents | Reagent information |
| 6 | S.6 | Units of Measurement | Units used |
| 7 | S.7 | Quality Control | QC information |
| 8 | S.8 | Specimen Descriptor | Specimen details |
| 9+ | S.9+ | Additional | Additional scientific data |

**Note:** S records are extremely rare in real-world analyzer communication. Most middleware implementations can safely log them but do not need to parse them.

### 3.13 Multi-Frame Messages

When a message (consisting of one or more records) exceeds the 240-byte data limit of a single frame, it is split across multiple frames:

**Single-frame message (fits in 240 bytes):**
```
<STX> 1 H|\^&|||Host||||||LIS2-A2|20240115<CR> <ETX> [checksum] <CR><LF>
```

**Multi-frame message (exceeds 240 bytes):**
```
Frame 1: <STX> 1 [first 240 bytes of data...] <ETB> [checksum] <CR><LF>
Frame 2: <STX> 2 [next 240 bytes of data...]  <ETB> [checksum] <CR><LF>
Frame 3: <STX> 3 [remaining data...]           <ETX> [checksum] <CR><LF>
```

**Rules:**
- Data is split at exactly the 240-byte boundary, even if that is in the middle of a field or record
- The frame number increments with each frame
- Only the last frame uses `<ETX>`; all others use `<ETB>`
- Each frame has its own independent checksum
- The receiver must concatenate the data from all intermediate frames before parsing records
- A message can contain multiple records (e.g., H + P + O + R + L can all be in one frame if they fit)

---

## 4. Real Message Examples

### 4.1 Example 1: Hematology CBC (Sysmex XP)

This shows a complete session from a Sysmex XP-100 hematology analyzer sending CBC results:

**Raw session (transport layer included):**

```
STEP 1 - Establishment:
  Analyzer → Host:  <ENQ>                              [0x05]
  Host → Analyzer:  <ACK>                              [0x06]

STEP 2 - Transfer (each frame gets ACK):
  Analyzer → Host:  <STX>1H|\^&|||XP-100^00-00^^^^
                     Sysmex XP-100 01^12345678|||||||
                     |E1394-97<CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>2P|1<CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>3O|1||^^12345ABCDE^B|
                     ^^^^WBC\^^^^RBC\^^^^HGB\^^^^HCT\
                     ^^^^MCV\^^^^MCH\^^^^MCHC\^^^^PLT
                     ||||||||||||||||||F<CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>4R|1|^^^^WBC^26|78|10*2/uL||
                     N||||123456789012345||20240115163530
                     <CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>5R|2|^^^^RBC^26|350|10*4/uL||
                     L||||123456789012345||20240115163530
                     <CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>6R|3|^^^^HGB^26|12.5|g/dL||
                     N||||123456789012345||20240115163530
                     <CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>7R|4|^^^^HCT^26|38.2|%||
                     N||||123456789012345||20240115163530
                     <CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>0R|5|^^^^PLT^26|245|10*3/uL||
                     N||||123456789012345||20240115163530
                     <CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

  Analyzer → Host:  <STX>1L|1|N<CR><ETX>[CS]<CR><LF>
  Host → Analyzer:  <ACK>

STEP 3 - Termination:
  Analyzer → Host:  <EOT>                              [0x04]
```

**Note:** `[CS]` represents the 2-character hex checksum. Frame numbers cycle: 1,2,3,4,5,6,7,0,1.

**Interpreting the results:**

| Test | Value | Units | Converted | Flag | Interpretation |
|------|-------|-------|-----------|------|----------------|
| WBC  | 78    | 10*2/uL | 7,800/uL (7.8 x10^3) | N (Normal) | Within range |
| RBC  | 350   | 10*4/uL | 3.50 x10^6/uL | L (Low) | Below normal |
| HGB  | 12.5  | g/dL | 12.5 g/dL | N (Normal) | Within range |
| HCT  | 38.2  | % | 38.2% | N (Normal) | Within range |
| PLT  | 245   | 10*3/uL | 245,000/uL | N (Normal) | Within range |

### 4.2 Example 2: Clinical Chemistry

This shows a simulated clinical chemistry analyzer (similar to Roche Cobas c111) sending glucose and creatinine results:

**ASTM records only (without transport framing):**

```
H|\^&|||Cobas c111^1.0^SN001|||||||P|E1394-97|20240115100000
P|1||PAT-2024-001||Smith^Jane^M||19780422|F
O|1|SPC-2024-00042||^^^GLU\^^^CREA|||20240115093000|||||||SERUM|||||||20240115100000||||F
R|1|^^^GLU|95|mg/dL|70-100|N||F||Tech01|20240115095500|20240115100000|Cobas c111
R|2|^^^CREA|0.9|mg/dL|0.6-1.2|N||F||Tech01|20240115095800|20240115100000|Cobas c111
L|1|N
```

**Field-by-field breakdown of the Result records:**

**R|1| (Glucose):**
- R.2 = `1` (first result)
- R.3 = `^^^GLU` (test ID: Glucose)
- R.4 = `95` (result value: 95)
- R.5 = `mg/dL` (units)
- R.6 = `70-100` (reference range: 70-100 mg/dL)
- R.7 = `N` (normal)
- R.8 = (empty)
- R.9 = `F` (final)
- R.10 = (empty)
- R.11 = `Tech01` (operator)
- R.12 = `20240115095500` (test started)
- R.13 = `20240115100000` (test completed)
- R.14 = `Cobas c111` (instrument ID)

**R|2| (Creatinine):**
- R.2 = `2` (second result)
- R.3 = `^^^CREA` (test ID: Creatinine)
- R.4 = `0.9` (result value: 0.9)
- R.5 = `mg/dL` (units)
- R.6 = `0.6-1.2` (reference range)
- R.7 = `N` (normal)
- R.9 = `F` (final)

**With abnormal results, it would look like:**
```
R|3|^^^CREA|2.8|mg/dL|0.6-1.2|H||F||Tech01|20240115095800|20240115100000|Cobas c111
```
Here R.7 = `H` (high) because 2.8 exceeds the reference range of 0.6-1.2.

### 4.3 Example 3: Host Query for Orders (Bidirectional)

When an instrument scans a barcode and asks the host "what tests should I run?":

**Step 1 -- Instrument queries host:**
```
  Instrument → Host:  <ENQ>
  Host → Instrument:  <ACK>

  Instrument → Host:  <STX>1H|\^&|||Analyzer^1.0|||||||
                       |Q|E1394-97|20240115080000<CR><ETX>[CS]<CR><LF>
  Host → Instrument:  <ACK>

  Instrument → Host:  <STX>2Q|1|^SPC-2024-00099||^^^ALL
                       ||||||||O<CR><ETX>[CS]<CR><LF>
  Host → Instrument:  <ACK>

  Instrument → Host:  <STX>3L|1|N<CR><ETX>[CS]<CR><LF>
  Host → Instrument:  <ACK>

  Instrument → Host:  <EOT>
```

**Step 2 -- Host responds with order information:**
```
  Host → Instrument:  <ENQ>
  Instrument → Host:  <ACK>

  Host → Instrument:  <STX>1H|\^&|||LabHost^2.0|||||||
                       |P|E1394-97|20240115080005<CR><ETX>[CS]<CR><LF>
  Instrument → Host:  <ACK>

  Host → Instrument:  <STX>2P|1||PAT-2024-001||
                       Johnson^Robert^T||19650812|M<CR><ETX>[CS]<CR><LF>
  Instrument → Host:  <ACK>

  Host → Instrument:  <STX>3O|1|SPC-2024-00099||
                       ^^^GLU\^^^CREA\^^^BUN|R|20240115075500
                       |||||||||SERUM<CR><ETX>[CS]<CR><LF>
  Instrument → Host:  <ACK>

  Host → Instrument:  <STX>4L|1|N<CR><ETX>[CS]<CR><LF>
  Instrument → Host:  <ACK>

  Host → Instrument:  <EOT>
```

This bidirectional exchange lets the instrument know: "For specimen SPC-2024-00099, run Glucose, Creatinine, and BUN for patient Robert Johnson."

---

## 5. Implementation Notes for Node.js/TypeScript

### 5.1 State Machine Implementation

Implement the transport layer as an explicit state machine. Here is a recommended approach:

```typescript
// Recommended transport states
enum AstmState {
  NEUTRAL,           // Idle -- neither side is communicating
  ESTABLISHING,      // We sent ENQ, waiting for ACK/NAK
  SENDING,           // We are sending frames, waiting for ACK/NAK per frame
  RECEIVING_READY,   // We received ENQ, sent ACK, ready to receive
  RECEIVING,         // Actively receiving frames
}

// Control character constants
const CTRL = {
  ENQ: 0x05,
  ACK: 0x06,
  NAK: 0x15,
  STX: 0x02,
  ETX: 0x03,
  ETB: 0x17,
  EOT: 0x04,
  CR:  0x0D,
  LF:  0x0A,
} as const;

// Timeout constants (milliseconds)
const TIMEOUTS = {
  ENQ_RESPONSE:       15_000,  // Wait for ACK/NAK after sending ENQ
  FRAME_RESPONSE:     15_000,  // Wait for ACK/NAK after sending a frame
  RECEIVER_IDLE:      30_000,  // Receiver timeout waiting for frame/EOT
  BUSY_RETRY:         10_000,  // Min wait after NAK to ENQ before retrying
  CONTENTION_RETRY:    1_000,  // Min wait for instrument in contention
  CONTENTION_COMPUTER:20_000,  // Computer wait after contention
} as const;

const MAX_FRAME_RETRIES = 6;
const MAX_DATA_PER_FRAME = 240;
```

**State transitions to implement:**

```
NEUTRAL:
  → send ENQ          → ESTABLISHING
  → receive ENQ       → send ACK → RECEIVING_READY
  → receive anything else → ignore (stay NEUTRAL)

ESTABLISHING:
  → receive ACK       → SENDING (start transmitting frames)
  → receive NAK       → wait 10s, send ENQ again (stay ESTABLISHING)
  → receive ENQ       → CONTENTION (yield if we are host, resend ENQ if instrument)
  → timeout (15s)     → send EOT → NEUTRAL

SENDING:
  → send frame        → wait for response
  → receive ACK       → send next frame or EOT
  → receive NAK       → retransmit frame (up to 6 times)
  → receive EOT       → RECEIVER INTERRUPT → NEUTRAL
  → timeout (15s)     → send EOT → NEUTRAL
  → retry limit (6)   → send EOT → NEUTRAL

RECEIVING_READY / RECEIVING:
  → receive STX frame → validate checksum → send ACK/NAK → RECEIVING
  → receive EOT       → NEUTRAL
  → timeout (30s)     → NEUTRAL
```

### 5.2 Key Gotchas and Edge Cases

These are problems that real implementations encounter. Learn from others' mistakes:

**1. CR inside records vs CR at end of frame**

Every ASTM record ends with `<CR>` (0x0D). This is part of the record data and gets included in the checksum. But there is ALSO a `<CR><LF>` pair at the very end of the frame (after the checksum). Do not confuse them:

```
<STX> 1 R|1|^^^WBC|7.5|10*3/uL <CR> <ETX> A5 <CR><LF>
                                 ↑            ↑
                          Record terminator   Frame trailer
                          (IN the checksum)   (NOT in checksum)
```

**2. Some analyzers send `\r\n` (CRLF) instead of just `\r` (CR) as record terminators**

The standard says `<CR>` only, but some instruments use `<CR><LF>`. If your checksum calculation assumes only `<CR>`, it will fail. Be tolerant: strip any extra `<LF>` before the `<ETX>/<ETB>` when calculating checksums.

**3. Frame number starting at 0 vs 1**

The standard says start at 1 and cycle through 1,2,3,4,5,6,7,0,1,2... However, some analyzers start at 0. Your implementation should accept frame numbers starting at either 0 or 1.

**4. Empty fields and trailing delimiters**

Many analyzers omit trailing empty fields. For example, instead of:
```
R|1|^^^WBC|7.5|10*3/uL||N||F||||||
```
They send:
```
R|1|^^^WBC|7.5|10*3/uL||N||F
```
Your parser must handle both forms. Never assume a fixed number of fields.

**5. Delimiter swapping in the Header**

The standard convention `H|\^&` means: field=`|`, component=`\`, repeat=`^`, escape=`&`. But some manufacturers use `H|\\^&` (with a doubled backslash) or different delimiter assignments. **Always parse the Header record's delimiter declaration** rather than hardcoding.

**6. TCP vs Serial timing differences**

Over TCP/IP, data arrives in chunks that may not align with frame boundaries. You may receive a partial frame in one TCP read and the rest in the next. Implement a proper buffer that accumulates bytes until you see a complete frame (`<STX>...<CR><LF>`).

Over serial, data arrives byte-by-byte at the baud rate. A 240-byte frame at 9600 baud takes about 250ms to transmit.

**7. Multiple messages in one session**

Some analyzers batch multiple patients' results in a single ENQ-to-EOT session. The session may contain multiple H...L message sequences:
```
ENQ → ACK → [H...P...O...R...L] → ACK → [H...P...O...R...L] → ACK → EOT
```
Or more commonly, a single H...L containing multiple P/O/R groups.

**8. Checksum = "00" edge case**

A valid checksum can be `00`. Do not treat this as "no checksum" or skip validation.

**9. Some analyzers do not send Patient records**

Many analyzers (especially if configured for unidirectional mode) skip the P record entirely and send: `H → O → R → R → R → L`. The middleware must not require P records.

**10. Instrument sends EOT without any data**

Sometimes an analyzer sends `ENQ`, gets `ACK`, then immediately sends `EOT` without any frames. This can happen when the analyzer has nothing to send or experienced an internal error. Handle this gracefully.

### 5.3 Vendor Quirks (Common Deviations)

Based on real-world experience with the analyzers in our target list:

| Analyzer | Known Quirks |
|----------|-------------|
| **Roche Cobas c111 / e411** | Generally well-behaved ASTM. May use different test code formats. Watch for proprietary fields in C records for QC flags. |
| **Sysmex XN-550** | Result units use notation like `10*2/uL` (not SI). May send Manufacturer (M) records with scattergram data. Frame numbering starts at 1. |
| **Roche Hitachi 917/7180** | Older instruments. May use an older ASTM variant (LIS1-A vs LIS2-A2). Check if checksum handling differs. Some use 7-bit ASCII only. |
| **Bio-Rad D-10** | ASTM-compliant but uses LIS1-A (the older version). Field ordering may differ slightly. |
| **Mindray BC-3510** | Supports both HL7v2 and ASTM. In ASTM mode, may have slight timing issues -- ACK response time may need to be faster than 15s standard. |
| **Snibe Maglumi X3** | Dual protocol (ASTM + HL7). Check which mode is configured. May send extended manufacturer-specific fields. |
| **Tosoh AIA-360** | Simple ASTM implementation. Generally compliant. May not support bidirectional queries. |

**General vendor deviation patterns:**
- **Delimiter variations:** Always parse from Header, never hardcode
- **Missing fields:** Some analyzers send fewer fields than the standard defines
- **Extra fields:** Some analyzers add proprietary fields beyond the standard's defined count
- **Timestamp formats:** Some use `YYYYMMDD` (date only), some `YYYYMMDDHHMMSS`, some add milliseconds
- **Test ID format:** Varies wildly. `^^^GLU`, `^^^GLU^1`, `^^^Glucose`, `GLU`, `1` -- map each analyzer
- **Encoding:** Most use ASCII/Latin-1, but some newer instruments may attempt UTF-8

### 5.4 Recommended Architecture

For the Node.js middleware, structure the ASTM handling in layers:

```
┌─────────────────────────────────┐
│  Connection Layer               │  ← serialport / net.Socket
│  (manages bytes in/out)         │
├─────────────────────────────────┤
│  Transport Layer (E1381)        │  ← State machine: ENQ/ACK/frames
│  - Frame assembly/disassembly   │
│  - Checksum calc/validation     │
│  - Timeout management           │
│  - Retry logic                  │
├─────────────────────────────────┤
│  Record Parser (E1394)          │  ← Parse H/P/O/R/C/Q/L records
│  - Delimiter parsing            │
│  - Field extraction             │
│  - Multi-frame reassembly       │
├─────────────────────────────────┤
│  Result Mapper                  │  ← Analyzer-specific mappings
│  - Test code → LOINC/local code │
│  - Unit conversion              │
│  - Flag normalization           │
└─────────────────────────────────┘
```

**Key implementation tips:**

1. **Use EventEmitter pattern** for the transport layer. Emit events like `'frame'`, `'message'`, `'error'`, `'timeout'`, `'session-start'`, `'session-end'`.

2. **Buffer incoming bytes** in a `Buffer` or `Uint8Array`. Do not process partial frames. Wait for the complete frame terminator (`<CR><LF>` after checksum).

3. **Keep the transport state machine pure.** It should only deal with bytes and control characters. The record parsing should be a separate module that receives complete reassembled messages.

4. **Log everything.** Log every byte sent and received at the transport level (hex dump). This is invaluable for debugging analyzer communication issues. Use a ring buffer to avoid filling the disk.

5. **Make timeouts configurable per analyzer.** Some analyzers are slower than others. A Roche Hitachi 917 from the 1990s may need longer timeouts than a modern Sysmex XN.

6. **Handle serial port disconnection.** `serialport` in Node.js will emit `'close'` events. Auto-reconnect with exponential backoff (e.g., 1s, 2s, 4s, 8s, max 30s).

7. **For TCP connections**, use `net.createServer()` (analyzer connects to us) or `net.connect()` (we connect to analyzer). The connection direction depends on the analyzer's configuration.

---

## Sources

This document was compiled from the following sources:

1. **ASTM E1381-95/02 Standard** -- "Standard Specification for Low-Level Protocol to Transfer Messages Between Clinical Laboratory Instruments and Computer Systems" (via ASTM International, pdfcoffee.com mirror)
2. **ASTM E1394-97 Standard** -- "Standard Specification for Transferring Information Between Clinical Instruments and Computer Systems" (via ASTM International)
3. **CLSI LIS01-A2** -- CLSI successor to ASTM E1381 (via ANSI webstore preview)
4. **CLSI LIS02-A2** -- CLSI successor to ASTM E1394 (via CLSI sample preview)
5. **Sysmex XP Series ASTM Communication Specifications Rev 2.5** -- Manufacturer interface guide (via medteh.info, pdfcoffee.com)
6. **InterfaceWare Help Center** -- "Translator as ASTM TCP Client" implementation guide
7. **Hendrickson Group** -- "Calculating the Checksum of an ASTM Document" reference
8. **Charlie Stras Blog** -- "Calculate Checksum For ASTM Frame" with JavaScript implementation
9. **python-astm project** (kxepal/python-astm) -- Python ASTM E1381/1394 implementation, readthedocs documentation
10. **TWGenaux ASTM Message Formats** -- "Introduction to ASTM Message Formats" and "ASTM E1394 Message Parsing"
11. **Mirth Connect Forums** -- ASTM message handling discussions
12. **UniversaLIS** (roy-harmon/UniversaLIS) -- .NET ASTM/CLSI-compliant LIS implementation
