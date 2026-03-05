# Research: Clinical Chemistry & Immunoassay Analyzers

**Date:** 2026-03-05
**Scope:** Roche Cobas c111, e411, Hitachi 917/7180, Bio-Rad D-10, Tosoh AIA-360, Snibe Maglumi X3
**Purpose:** Complete technical reference for building per-analyzer test code mapping files in the MediMind Lab Middleware.

---

## Table of Contents

1. [Roche Cobas c 111 (Clinical Chemistry)](#1-roche-cobas-c-111-clinical-chemistry)
2. [Roche Cobas e 411 (Immunoassay)](#2-roche-cobas-e-411-immunoassay)
3. [Roche Hitachi 917/7180 (Chemistry)](#3-roche-hitachi-9177180-chemistry)
4. [Bio-Rad D-10 (HbA1c / Hemoglobin Variants)](#4-bio-rad-d-10-hba1c--hemoglobin-variants)
5. [Tosoh AIA-360 (Immunoassay)](#5-tosoh-aia-360-immunoassay)
6. [Snibe Maglumi X3 (Immunoassay)](#6-snibe-maglumi-x3-immunoassay)
7. [Complete LOINC Reference Tables](#7-complete-loinc-reference-tables)
8. [Flag/Interpretation Mapping](#8-flaginterpretation-mapping)
9. [Sources](#9-sources)

---

## 1. Roche Cobas c 111 (Clinical Chemistry)

### 1.1 Overview

The cobas c 111 is a compact clinical chemistry analyzer from Roche Diagnostics. Think of it as the "workhorse" for routine blood chemistry -- it measures things like blood sugar, kidney function, liver enzymes, and cholesterol. It can run over 40 different chemistry tests at up to 85 tests per hour, with up to 27 cooled reagent positions onboard.

### 1.2 ASTM Protocol Details

**Standard:** ASTM E1381-97 (low-level transport) / ASTM E1394-97 (message format), also known as LIS1-A / LIS2-A2 under CLSI.

**Physical connection:** RS-232 serial, DB-9 connector.

**Default serial settings:** 9600 baud, 8 data bits, no parity, 1 stop bit (8-N-1).

**Frame format:**
- Frame structure: `[STX][FN][Data][ETX or ETB][C1][C2][CR][LF]`
  - `STX` (0x02) -- start of frame
  - `FN` -- frame number (single digit 0-7, cycling)
  - `Data` -- record content, max 240 bytes per frame (if a record exceeds 240 bytes, it is split across multiple frames using ETB for intermediate frames)
  - `ETX` (0x03) -- end of last/only frame in a message
  - `ETB` (0x17) -- end of intermediate frame (more frames follow)
  - `C1C2` -- two-character checksum (hex digits, sum of bytes from FN through ETX/ETB, modulo 256)
  - `CR` (0x0D) + `LF` (0x0A) -- line terminator

**Low-level handshake:**
1. Sender sends `ENQ` (0x05)
2. Receiver responds with `ACK` (0x06) if ready, or `NAK` (0x15) if busy
3. Sender transmits frames, receiver ACKs each frame
4. Sender sends `EOT` (0x04) to end session

**Delimiters (set in Header record):**
- Field separator: `|` (pipe)
- Repeat separator: `\` (backslash)
- Component separator: `^` (caret)
- Escape character: `&`

**Roche-specific quirks:**
- The cobas c111 identifies itself in the Header record as `c111^Roche^c111^[software version]^1^[serial number]`
- Uses "ACN" (Application Code Number) -- a Roche-internal 3-digit test identifier placed in field 4 of the Result record as `^^^ACN`
- The Host Application Code (HAC) is a lab-configurable test code used for host communication; a mapping table on the instrument translates between HAC and ACN
- Frame numbers cycle 0-7 (not just 0-1 as some implementations assume)
- When sending multi-frame records, uses ETB (0x17) for intermediate frames -- some middleware implementations fail to handle ETB correctly; our parser must handle both ETX and ETB
- Result uploads use "RSUPL^BATCH" in the Header's processing ID field
- Operator ID in Result records may be `$SYS$` for auto-calculated results or an actual user ID
- The instrument sends Comment (C) and Manufacturer (M) records in addition to the standard H/P/O/R/L records

### 1.3 Test Codes (ACN) and Available Tests

Each test on the cobas c 111 is identified by a 3-digit Application Code Number (ACN). The ACN appears in the ASTM Result record in field 3 (Universal Test ID) as `^^^ACN`.

The following table lists the common tests available on the cobas c 111. ACN codes are based on real cobas c111 ASTM messages and Roche reagent documentation. Some ACN values may vary by software version and regional configuration.

| ACN | Roche Abbreviation | Test Name | LOINC Code | Unit | Specimen |
|-----|-------------------|-----------|------------|------|----------|
| 401 | GLUC2 / GLUC3 | Glucose (Hexokinase) | 2345-7 | mg/dL | Serum/Plasma |
| 402 | CREA / CREP2 | Creatinine (Jaffe or Enzymatic) | 2160-0 | mg/dL | Serum/Plasma |
| 404 | UREL / UREA | Urea / BUN | 3094-0 | mg/dL | Serum/Plasma |
| 405 | UA2 | Uric Acid | 3084-1 | mg/dL | Serum/Plasma |
| 407 | TP2 | Total Protein | 2885-2 | g/dL | Serum/Plasma |
| 413 | ALB2 / ALBT2 | Albumin (BCG) | 1751-7 | g/L | Serum/Plasma |
| 416 | ALTL | ALT / SGPT (without P5P) | 1742-6 | U/L | Serum/Plasma |
| 417 | ASTL | AST / SGOT (without P5P) | 1920-8 | U/L | Serum/Plasma |
| 418 | ALP2 | Alkaline Phosphatase | 6768-6 | U/L | Serum/Plasma |
| 426 | LDHI2 | LDH (Lactate Dehydrogenase) | 2532-0 | U/L | Serum/Plasma |
| 429 | CK2 | Creatine Kinase (CK) | 2157-6 | U/L | Serum/Plasma |
| 434 | AMY2 | Amylase (Pancreatic) | 1798-8 | U/L | Serum/Plasma |
| 436 | LIP | Lipase | 3040-3 | U/L | Serum/Plasma |
| 450 | CHOL2 | Total Cholesterol | 2093-3 | mg/dL | Serum/Plasma |
| 452 | TRIGL | Triglycerides | 2571-8 | mg/dL | Serum/Plasma |
| 454 | HDLC3 / HDLC4 | HDL Cholesterol (Direct) | 2085-9 | mg/dL | Serum/Plasma |
| 456 | LDLC3 | LDL Cholesterol (Direct) | 2089-1 | mg/dL | Serum/Plasma |
| 460 | CA2 | Calcium | 17861-6 | mg/dL | Serum/Plasma |
| 461 | PHOS2 | Phosphorus (Inorganic) | 2777-1 | mg/dL | Serum/Plasma |
| 464 | MG2 | Magnesium | 19123-9 | mg/dL | Serum/Plasma |
| 470 | FE2 | Iron | 2498-4 | ug/dL | Serum/Plasma |
| 474 | TIBC2 | TIBC (Total Iron Binding Capacity) | 2500-7 | ug/dL | Serum/Plasma |
| 480 | TBIL2 | Total Bilirubin | 1975-2 | mg/dL | Serum/Plasma |
| 481 | DBIL2 | Direct Bilirubin | 1968-7 | mg/dL | Serum/Plasma |
| 685 | GGT2 | GGT (Gamma-GT) | 2324-2 | U/L | Serum/Plasma |
| 687 | HSCRP | High-Sensitivity CRP | 30522-7 | mg/L | Serum/Plasma |
| 690 | BILT3 | Total Bilirubin (Gen.3) | 1975-2 | umol/L | Serum/Plasma |
| 767 | CHOL2 | Cholesterol (alternate code) | 2093-3 | mmol/L | Serum/Plasma |
| ISE Na | NA | Sodium (ISE) | 2951-2 | mmol/L | Serum/Plasma |
| ISE K | K | Potassium (ISE) | 2823-3 | mmol/L | Serum/Plasma |
| ISE Cl | CL | Chloride (ISE) | 2075-0 | mmol/L | Serum/Plasma |

**Notes:**
- ACN codes above 600 are often newer-generation reagents. Codes 685 (GGT), 687 (hsCRP), 690 (Bilirubin Gen.3) have been confirmed from real ASTM messages.
- ISE (Ion-Selective Electrode) tests for Na/K/Cl use a separate module and may have different ACN numbering.
- The cobas c111 with ISE module handles electrolytes; without ISE, electrolytes are not available.
- Some ACN codes differ between cobas c111 (smaller instrument) and cobas c311/c501 (larger instruments) due to reagent kit differences.
- Regional Roche offices may assign different ACN numbers; always verify against the actual instrument's Host Interface configuration.

### 1.4 Sample ASTM Result Message (cobas c 111)

This is a real ASTM message captured from a cobas c111, showing test results being uploaded to the host:

```
H|\^&|||c111^Roche^c111^4.3.0.1835^1^16850|||||host|RSUPL^BATCH|P|1|20230728151546
P|1||
O|1||T20-10242-GH-D3||R||||||N|||||||||||20230728150931|||F
R|1|^^^413|39.13|g/L||N||F||$SYS$||20230728113801
R|2|^^^685|16.8|U/L||N||F||$SYS$||20230728114325
R|3|^^^687|34.6|U/L||N||F||$SYS$||20230728114325
R|4|^^^690|32.5|umol/L||N||F||IGA||20230728114231
R|5|^^^450|4.85|mmol/L||N||F||$SYS$||20230728114607
R|6|^^^767|4.42|mmol/L||N||F||$SYS$||20230728114607
L|1|N
```

**Field-by-field breakdown of a Result record:**

```
R|1|^^^413|39.13|g/L||N||F||$SYS$||20230728113801
```

| Position | Field | Value | Meaning |
|----------|-------|-------|---------|
| R.1 | Record Type | R | Result record |
| R.2 | Sequence | 1 | First result in this order |
| R.3 | Universal Test ID | `^^^413` | ACN 413 = Albumin |
| R.4 | Measurement Value | 39.13 | The numeric result |
| R.5 | Units | g/L | Grams per liter |
| R.6 | Reference Ranges | (empty) | Not sent by c111 by default |
| R.7 | Abnormal Flag | N | Normal |
| R.8 | Nature of Abnormality | (empty) | |
| R.9 | Result Status | F | Final result |
| R.10 | Date of Change | (empty) | |
| R.11 | Operator ID | $SYS$ | System-calculated result |
| R.12 | Date Started | (empty) | |
| R.13 | Date Completed | 20230728113801 | Timestamp (YYYYMMDDHHMMSS) |

---

## 2. Roche Cobas e 411 (Immunoassay)

### 2.1 Overview

The cobas e 411 is Roche's benchtop electrochemiluminescence (ECL) immunoassay analyzer. Think of it as the machine that measures hormones, tumor markers, and infectious disease antibodies -- things that are present in very small concentrations and need ultra-sensitive detection. It uses Elecsys reagent technology and can run about 86 tests per hour.

### 2.2 ASTM Protocol Details

**Standard:** ASTM E1381-91 / ASTM E1394-91 (slightly older version reference than c111, but functionally equivalent).

**Physical connection:** RS-232C serial, DB-9 connector.

**Default serial settings:** 9600 baud, 8 data bits, no parity, 1 stop bit. Supports 4800/9600/19200 baud rates.

**Frame/message format:** Identical to cobas c111 -- same STX/ETX/ETB framing, same checksum algorithm, same delimiter characters.

**Protocol types:** The e411 supports two selectable protocol modes:
1. **Elecsys type** -- legacy format compatible with older Elecsys 2010 analyzers
2. **cobas type** -- newer format with additional fields for calculated test results

Both use ASTM, but the field positions and content of some records differ slightly. For new installations, the "cobas type" is recommended.

**Key differences from c111:**
- Header identifies as `cobas-e411^1` (or similar)
- Test identification uses the Roche "test number" (similar to ACN but from the Elecsys numbering scheme)
- Result record field 3 uses `^^^[test_number]` format
- The e411 can send qualitative results (e.g., "Positive"/"Negative" for infectious disease markers) in addition to quantitative values
- Supports "Host Code" configuration -- each test can be assigned a custom host code for LIS communication
- Frame size limit: 240 bytes per frame (same as c111)

**e411-specific quirks:**
- The Host Code entered on the instrument MUST match what the LIS expects; if it does not match, results will be rejected or misrouted
- For result uploads, the status field can contain: "N" for normal, "F" for flagged/abnormal
- When dilution is performed, the Result record includes dilution information in the abnormal flags field
- The e411 can report results as `>` or `<` when values exceed the measurement range (e.g., `>100.0` for TSH in severe hypothyroidism)

### 2.3 Test Codes and Available Immunoassays

Each Elecsys test on the e411 is identified by a Roche Test Number. These are placed in the ASTM Result record as `^^^[test_number]`. The Host Code is a lab-configurable alias.

| Roche Test No. | Elecsys Assay Name | Common Name | LOINC Code | Unit | Reference Range (Adult) |
|---|---|---|---|---|---|
| 146 | Elecsys TSH | TSH (3rd gen) | 11579-0 | uIU/mL | 0.27 - 4.20 |
| 142 | Elecsys FT4 III | Free T4 | 3024-7 | ng/dL | 0.93 - 1.70 |
| 143 | Elecsys FT3 III | Free T3 | 3051-0 | pg/mL | 2.0 - 4.4 |
| 144 | Elecsys T4 | Total T4 | 3026-2 | ug/dL | 5.1 - 14.1 |
| 145 | Elecsys T3 | Total T3 | 3053-6 | ng/mL | 0.8 - 2.0 |
| 171 | Elecsys Ferritin | Ferritin | 2276-4 | ng/mL | M: 30-400; F: 15-150 |
| 122 | Elecsys Vitamin D total | 25-OH Vitamin D | 62292-8 | ng/mL | 30 - 100 (sufficient) |
| 163 | Elecsys Troponin T hs | hs-Troponin T | 67151-1 | pg/mL | <14 (99th percentile) |
| 164 | Elecsys CK-MB | CK-MB mass | 49551-5 | ng/mL | <4.94 |
| 170 | Elecsys Myoglobin | Myoglobin | 30088-9 | ng/mL | M: 28-72; F: 25-58 |
| 172 | Elecsys Vitamin B12 | Vitamin B12 | 2132-9 | pg/mL | 197 - 771 |
| 173 | Elecsys Folate III | Folate | 2284-8 | ng/mL | >3.0 |
| 130 | Elecsys PSA | Total PSA | 2857-1 | ng/mL | <4.0 |
| 131 | Elecsys free PSA | Free PSA | 10886-0 | ng/mL | report with ratio |
| 147 | Elecsys Anti-TPO | Anti-TPO | 8099-4 | IU/mL | <34 |
| 148 | Elecsys Anti-Tg | Anti-Thyroglobulin | 8098-6 | IU/mL | <115 |
| 155 | Elecsys Cortisol | Cortisol | 2143-6 | ug/dL | AM: 6.2-19.4 |
| 150 | Elecsys Prolactin II | Prolactin | 2842-3 | ng/mL | M: 4.04-15.2; F: 4.79-23.3 |
| 151 | Elecsys LH | LH | 10501-5 | mIU/mL | varies by phase |
| 152 | Elecsys FSH | FSH | 15067-2 | mIU/mL | varies by phase |
| 153 | Elecsys Estradiol III | Estradiol | 2243-4 | pg/mL | varies by phase |
| 154 | Elecsys Progesterone III | Progesterone | 2839-9 | ng/mL | varies by phase |
| 156 | Elecsys Testosterone II | Testosterone | 2986-8 | ng/dL | M: 249-836; F: 8.4-48.1 |
| 157 | Elecsys DHEA-S | DHEA-S | 2191-5 | ug/dL | varies by age |
| 690 | Elecsys HCG+beta | Total beta-HCG | 21198-7 | mIU/mL | <5.0 (non-pregnant) |
| 160 | Elecsys Intact PTH | Intact PTH | 2731-8 | pg/mL | 15 - 65 |
| 161 | Elecsys Insulin | Insulin | 2484-4 | uU/mL | 2.6 - 24.9 |
| 162 | Elecsys C-Peptide | C-Peptide | 1986-9 | ng/mL | 1.1 - 4.4 |
| 113 | Elecsys CEA | CEA | 2039-6 | ng/mL | <3.4 (non-smoker) |
| 114 | Elecsys AFP | AFP | 1834-1 | ng/mL | <7.0 |
| 115 | Elecsys CA 125 II | CA 125 | 10334-1 | U/mL | <35 |
| 116 | Elecsys CA 19-9 | CA 19-9 | 24108-3 | U/mL | <37 |
| 117 | Elecsys CA 15-3 | CA 15-3 | 6875-9 | U/mL | <25 |
| 118 | Elecsys CA 72-4 | CA 72-4 | 10454-7 | U/mL | <6.9 |
| 120 | Elecsys NSE | NSE | 17453-4 | ng/mL | <16.3 |
| 126 | Elecsys PCT | Procalcitonin | 75241-0 | ng/mL | <0.5 (low risk) |
| 127 | Elecsys IL-6 | Interleukin-6 | 26881-3 | pg/mL | <7.0 |
| 165 | Elecsys NT-proBNP | NT-proBNP | 33762-6 | pg/mL | age-dependent |

**Notes:**
- Test numbers above are representative of common Elecsys numbering. The actual numbers programmed on a specific e411 instrument may vary based on software version and regional configuration.
- The "Host Code" is user-configurable on the instrument and can be set to anything; our middleware should map based on the Universal Test ID from the ASTM result record.
- Reference ranges are adult population defaults. Pediatric, geriatric, and pregnancy-specific ranges differ.

### 2.4 Sample ASTM Result Message (cobas e 411)

```
H|\^&|||cobas-e411^1|||||host|RSUPL^BATCH|P|1|20240115093045
P|1||12345678||DOE^JOHN||19800115|M
O|1||B2024-00123||R||||||N||||||||||||20240115092800|||F
R|1|^^^146|2.45|uIU/mL|0.27^4.20|N||F||||20240115093001
R|2|^^^142|1.23|ng/dL|0.93^1.70|N||F||||20240115093015
R|3|^^^171|245.0|ng/mL|30^400|N||F||||20240115093030
R|4|^^^163|8.5|pg/mL|^14|N||F||||20240115093040
L|1|N
```

---

## 3. Roche Hitachi 917/7180 (Chemistry)

### 3.1 Overview

The Hitachi 917 and 7180 are older-generation high-throughput clinical chemistry analyzers originally manufactured by Hitachi and later sold under the Roche brand. Think of them as the "big brothers" of the cobas c111 -- designed for large-volume laboratories. The Hitachi 917 was a workhorse from the late 1990s through the 2000s, and the Hitachi 7180 is its successor. Many labs in developing countries still use these instruments.

### 3.2 ASTM Protocol Details

**Standard:** ASTM E1381/E1394 (same family as cobas c111 and e411).

**Physical connection:** RS-232 serial.

**Default serial settings:** 9600 baud, 8 data bits, no parity, 1 stop bit.

**Key differences from cobas c111:**

| Feature | Hitachi 917/7180 | Cobas c111 |
|---------|-----------------|------------|
| ASTM version ref | E1381-91 / E1394-91 (older) | E1381-97 / E1394-97 (newer) |
| Instrument ID in Header | `917^Hitachi` or `7180^Hitachi` | `c111^Roche^c111^[version]` |
| Test ID format | `^^^[channel_number]` | `^^^[ACN]` |
| Test numbering | Uses channel numbers (1-120) | Uses 3-digit ACN codes (400+) |
| Frame size | 247 bytes max | 240 bytes max |
| Protocol type | Single "Hitachi" type | Supports Elecsys and cobas modes |
| Calculated results | Sent as separate result records | May use Comment records |
| Dilution handling | Includes dilution factor in result | Via abnormal flags field |

**Hitachi-specific quirks:**
- The Hitachi 917 uses **channel numbers** (1-120) rather than Roche ACN codes. Each channel is configurable to a specific test. Channel assignments are set during installation and can vary between instruments.
- Some Hitachi models send a "Hitachi extended" record format that includes additional quality control information.
- The Hitachi 7180 added TCP/IP support in addition to serial, but the ASTM message format remains the same.
- Older Hitachi 917 firmware may not properly handle NAK retry sequences; the middleware should implement a generous timeout.
- The Hitachi sends ISE results (Na/K/Cl) as separate channel numbers from chemistry results.

### 3.3 Test Code Mapping

Since Hitachi instruments use channel numbers rather than standardized ACN codes, the mapping is installation-specific. However, common default channel assignments are:

| Channel | Common Assignment | Roche Reagent | LOINC Code | Unit |
|---------|------------------|---------------|------------|------|
| 1 | Glucose | GLUC2 / GLUC3 | 2345-7 | mg/dL |
| 2 | BUN / Urea | UREL | 3094-0 | mg/dL |
| 3 | Creatinine | CREA / CREP2 | 2160-0 | mg/dL |
| 4 | Uric Acid | UA2 | 3084-1 | mg/dL |
| 5 | Total Protein | TP2 | 2885-2 | g/dL |
| 6 | Albumin | ALB2 | 1751-7 | g/dL |
| 7 | Total Bilirubin | TBIL2 | 1975-2 | mg/dL |
| 8 | Direct Bilirubin | DBIL2 | 1968-7 | mg/dL |
| 9 | ALT (SGPT) | ALTL | 1742-6 | U/L |
| 10 | AST (SGOT) | ASTL | 1920-8 | U/L |
| 11 | ALP | ALP2 | 6768-6 | U/L |
| 12 | GGT | GGT2 | 2324-2 | U/L |
| 13 | LDH | LDHI2 | 2532-0 | U/L |
| 14 | CK | CK2 | 2157-6 | U/L |
| 15 | Amylase | AMY2 | 1798-8 | U/L |
| 16 | Lipase | LIP | 3040-3 | U/L |
| 17 | Total Cholesterol | CHOL2 | 2093-3 | mg/dL |
| 18 | Triglycerides | TRIGL | 2571-8 | mg/dL |
| 19 | HDL Cholesterol | HDLC3 | 2085-9 | mg/dL |
| 20 | LDL Cholesterol | LDLC3 | 2089-1 | mg/dL |
| 21 | Calcium | CA2 | 17861-6 | mg/dL |
| 22 | Phosphorus | PHOS2 | 2777-1 | mg/dL |
| 23 | Magnesium | MG2 | 19123-9 | mg/dL |
| 24 | Iron | FE2 | 2498-4 | ug/dL |
| 25 | TIBC | TIBC2 | 2500-7 | ug/dL |
| 26 | CRP / hsCRP | CRP / HSCRP | 1988-5 / 30522-7 | mg/L |
| ISE-Na | Sodium | -- | 2951-2 | mmol/L |
| ISE-K | Potassium | -- | 2823-3 | mmol/L |
| ISE-Cl | Chloride | -- | 2075-0 | mmol/L |

**IMPORTANT:** Channel-to-test mapping is NOT fixed -- it depends entirely on how the instrument was configured during installation. Our middleware configuration must allow the administrator to define the channel-to-LOINC mapping per instrument instance.

### 3.4 Implementation Strategy

Because the Hitachi uses the same underlying ASTM protocol as the cobas c111, we can reuse the same ASTM transport layer and parser. The only difference is in the test ID interpretation:

- **cobas c111:** `^^^ACN` where ACN is a known 3-digit code
- **Hitachi 917/7180:** `^^^channel` where channel is 1-120

Our per-analyzer mapping file (`analyzerMappings/roche-hitachi.ts`) will need a configurable channel-to-test lookup table that the hospital IT staff can customize.

---

## 4. Bio-Rad D-10 (HbA1c / Hemoglobin Variants)

### 4.1 Overview

The Bio-Rad D-10 is a dedicated HPLC (High-Performance Liquid Chromatography) system for hemoglobin analysis. Think of it as a specialized "hemoglobin detective" -- it separates different types of hemoglobin in a blood sample and measures their concentrations. Its primary job is measuring HbA1c (glycated hemoglobin, the "3-month blood sugar average" test for diabetes), but it also detects hemoglobin variants like HbS (sickle cell), HbC, HbF (fetal), and HbA2 (beta-thalassemia screening).

### 4.2 Protocol Details

**Standard:** LIS1-A (formerly ASTM E1381-02) for low-level transport, LIS2-A2 (formerly ASTM E1394) for message format. This is ASTM-compatible but Bio-Rad references the CLSI naming.

**Physical connection:** RS-232 serial, DB-9 connector. The D-10 operates as DTE (Data Terminal Equipment), so a **null modem cable** is required to connect to a computer (also DTE).

**Default serial settings:** 9600 baud, 8 data bits, 1 stop bit, no parity. Configurable to 1200/2400/4800/9600 baud.

**Communication mode:** Bidirectional -- the LIS can send test orders (queries) and the D-10 responds with results.

**Message format:** Uses 7-bit ASCII. Control characters (STX, ETX, ETB, ENQ, ACK, NAK, EOT) follow standard LIS1-A specification.

**Frame structure:** Same as ASTM: `[STX][FN][Data][ETX/ETB][C1][C2][CR][LF]`

### 4.3 D-10-Specific Quirks

1. **Exports ALL results:** The D-10 sends all results including controls and calibrators, regardless of whether the LIS ordered them. The middleware must filter out QC/cal results.

2. **Specimen ID format:** The instrument creates a composite specimen ID: `barcode-position-injection-date-LIS_ID`. Our parser needs to extract just the barcode portion.

3. **Universal Test ID format:** Uses 4 components: `^^^[local_code]`. The local code identifies the test.

4. **Peak-based reporting:** Results are reported as chromatographic peaks. Each peak has:
   - `AREA` -- concentration as area percent
   - `TIME` -- retention time in minutes
   - Unnamed peaks appear as P1, P2, etc.
   - The `TOTAL` result is always the last in the set.

5. **Query response behavior:** When responding to a LIS query, the D-10 sets Report Type to "Q". Final unsolicited messages use Termination Code "F".

6. **No scientific or manufacturer records:** The D-10 does not support Scientific (S) or Manufacturer (M) record types.

7. **No custom escape delimiters:** The escape character must remain `&` (default).

8. **No logical transmission error recovery:** If a message is corrupted, the entire message must be re-transmitted.

### 4.4 Test Codes

| Local Code | Peak/Test Name | Description | LOINC Code | Unit | Reference Range |
|------------|---------------|-------------|------------|------|----------------|
| 4 | A1c | Hemoglobin A1c | 4548-4 | % (DCCT/NGSP) | 4.0 - 6.0 (normal); <7.0 (diabetic target) |
| 4 | A1c | Hemoglobin A1c (IFCC) | 59261-8 | mmol/mol | 20 - 42 (normal) |
| 1 | A2 | Hemoglobin A2 | 4551-8 | % | 2.0 - 3.3 |
| 2 | F | Hemoglobin F (Fetal) | 4576-5 | % | <1.0 (adult) |
| -- | S window | Hemoglobin S | 35499-4 | % | 0 (absent normally) |
| -- | C window | Hemoglobin C | 30350-3 | % | 0 (absent normally) |
| -- | A1a | Hemoglobin A1a | -- | % | (sub-fraction, not routinely reported) |
| -- | A1b | Hemoglobin A1b | -- | % | (sub-fraction, not routinely reported) |
| -- | A0 | Hemoglobin A0 | -- | % | (non-glycated fraction) |
| -- | TOTAL | Total Area | -- | % | 100 |

**HbA1c reporting dual units:**
- DCCT/NGSP: `% of total hemoglobin` (LOINC 4548-4)
- IFCC: `mmol/mol` (LOINC 59261-8)
- Conversion: IFCC (mmol/mol) = (DCCT % - 2.15) x 10.929

**Critical values:**
- HbA1c > 14% -- critically elevated, verify and report immediately
- HbF > 10% -- may interfere with HbA1c measurement accuracy; flag for review
- HbS detected -- potential sickle cell trait/disease; flag for hematology review
- HbA2 > 3.5% -- suggestive of beta-thalassemia trait

### 4.5 Sample ASTM Messages

**Query from LIS to D-10:**
```
H|\^&|||LIS^01^5.0|||||||||20030530121314
Q|1|^12345||^^^4
L|1|N
```
This asks the D-10: "Do you have HbA1c results (test code 4) for specimen barcode 12345?"

**Result response from D-10:**
```
H|\^&|||D10^07^3.00|||||host|RSUP|P|1|20240115102030
P|1||
O|1||B2024-00456-01-20240115-LIS001||R||||||N||||||||||||20240115101500|||F
R|1|^^^A1c^AREA|5.4|%||N||F||||20240115101800
R|2|^^^A2^AREA|2.8|%||N||F||||20240115101800
R|3|^^^F^AREA|0.3|%||N||F||||20240115101800
R|4|^^^A0^AREA|91.5|%||N||F||||20240115101800
R|5|^^^TOTAL^AREA|100.0|%||N||F||||20240115101800
L|1|F
```

**Notes on parsing D-10 results:**
- The Universal Test ID uses named peak identifiers: `^^^A1c^AREA`, `^^^A2^AREA`, `^^^F^AREA`
- The 4th component (e.g., `A1c`, `A2`, `F`) identifies the hemoglobin fraction
- The 5th component (`AREA`) indicates this is a concentration measurement
- The D-10 identifies itself as `D10^[serial]^[software_version]` in the Header

---

## 5. Tosoh AIA-360 (Immunoassay)

### 5.1 Overview

The Tosoh AIA-360 is a compact automated immunoassay analyzer that uses Fluorometric Enzyme Immunoassay (FEIA) technology. Think of it as a smaller, specialized hormone-testing machine -- it uses pre-packaged single-test cups (unit dose) rather than bulk liquid reagents. It processes up to 36 tests per hour and is commonly used in smaller laboratories for thyroid, cardiac, diabetes, and tumor marker testing.

### 5.2 ASTM Protocol Details

**Standard:** ASTM-compliant (ASTM E1381/E1394). The AIA-360 follows standard ASTM protocol.

**Physical connection:** RS-232C serial. The specifications list "RS-232C" as the external output interface.

**Default serial settings:** 9600 baud, 8 data bits, no parity, 1 stop bit (standard lab analyzer defaults).

**Barcode compatibility:** Supports CODE39, CODE128, ITF, and NW-7 barcodes, compliant with ASTM 14466 and CLSI guidelines.

**Communication mode:** Bidirectional -- supports both unsolicited result uploads and host queries for sample worklists.

**Tosoh-specific notes:**
- The AIA-360 uses proprietary test cup part numbers as identifiers. The ASTM test code typically corresponds to the assay abbreviation (e.g., "TSH", "FT4").
- Results are stored internally (up to 300 results) and can be transmitted to LIS on demand.
- The instrument uses a 10-minute incubation time for all assays; this affects timing of result availability.

### 5.3 Test Codes and Available Assays

The Tosoh AIA system uses assay abbreviations as test identifiers in ASTM communication. The following tests are available on the AIA-360 platform:

**Thyroid Panel:**

| Test Code | Assay Name | LOINC Code | Unit | Reference Range (Adult) |
|-----------|-----------|------------|------|------------------------|
| TSH | TSH (3rd gen) | 11579-0 | uIU/mL | 0.35 - 4.94 |
| FT4 | Free T4 | 3024-7 | ng/dL | 0.70 - 1.48 |
| FT3 | Free T3 | 3051-0 | pg/mL | 1.71 - 3.71 |
| T4 | Total T4 | 3026-2 | ug/dL | 4.87 - 11.72 |
| TT3 | Total T3 | 3053-6 | ng/dL | 58.5 - 170.4 |
| TU | T-Uptake | 3050-2 | % | 22.5 - 37.0 |

**Cardiac Markers:**

| Test Code | Assay Name | LOINC Code | Unit | Reference Range |
|-----------|-----------|------------|------|----------------|
| CKMB | CK-MB mass | 49551-5 | ng/mL | <5.0 |
| MYO | Myoglobin | 30088-9 | ng/mL | <100 |
| CTNI | Troponin I (2nd gen) | 49563-0 | ng/mL | <0.04 |

**Tumor Markers:**

| Test Code | Assay Name | LOINC Code | Unit | Reference Range |
|-----------|-----------|------------|------|----------------|
| CEA | CEA | 2039-6 | ng/mL | <5.0 |
| AFP | AFP | 1834-1 | ng/mL | <10 |
| CA125 | CA 125 | 10334-1 | U/mL | <35 |
| CA199 | CA 19-9 | 24108-3 | U/mL | <37 |
| PA | Prostate Acid Phosphatase | 2578-3 | ng/mL | <3.0 |

**Reproductive Hormones:**
(Available on larger AIA models like AIA-900/2000; some may be available on AIA-360 with specific reagent kits)

| Test Code | Assay Name | LOINC Code | Unit |
|-----------|-----------|------------|------|
| LH | LH | 10501-5 | mIU/mL |
| FSH | FSH | 15067-2 | mIU/mL |
| PRL | Prolactin | 2842-3 | ng/mL |
| E2 | Estradiol | 2243-4 | pg/mL |
| PROG | Progesterone | 2839-9 | ng/mL |
| TESTO | Testosterone | 2986-8 | ng/dL |

**Anemia:**

| Test Code | Assay Name | LOINC Code | Unit | Reference Range |
|-----------|-----------|------------|------|----------------|
| FERR | Ferritin | 2276-4 | ng/mL | M: 30-400; F: 15-150 |

**Metabolic / Endocrine:**

| Test Code | Assay Name | LOINC Code | Unit | Reference Range (Adult) |
|-----------|-----------|------------|------|------------------------|
| CORT | Cortisol | 2143-6 | ug/dL | AM: 6.2-19.4 |
| HGH | Growth Hormone | 2963-7 | ng/mL | <5.0 |
| IRI | Insulin (IRI) | 2484-4 | uU/mL | 2.6 - 24.9 |
| CPEP | C-Peptide II | 1986-9 | ng/mL | 1.1 - 4.4 |
| ACTH | ACTH | 2141-0 | pg/mL | 7.2 - 63.3 |

**Kidney:**

| Test Code | Assay Name | LOINC Code | Unit |
|-----------|-----------|------------|------|
| CYSTC | Cystatin C | 33863-2 | mg/L |
| B2M | Beta-2 Microglobulin | 54356-8 | mg/L |
| IPTH | Intact PTH | 2731-8 | pg/mL |

**Other:**

| Test Code | Assay Name | LOINC Code | Unit |
|-----------|-----------|------------|------|
| HOMO | Homocysteine | 13965-9 | umol/L |
| IGE | Total IgE | 19113-0 | IU/mL |

---

## 6. Snibe Maglumi X3 (Immunoassay)

### 6.1 Overview

The Snibe Maglumi X3 is a chemiluminescence immunoassay (CLIA) analyzer from Shenzhen New Industries Biomedical Engineering (Snibe). Think of it as a versatile "all-in-one" immunoassay machine -- it can run up to 236 different immunoassay tests covering hormones, tumor markers, cardiac markers, infectious disease, autoimmune markers, and more. It processes up to 200 tests per hour.

### 6.2 Protocol Details

**Supported protocols:** Both ASTM E1394 and HL7 v2.x.

**Connection options:**
- Serial: RS-232 COM port (ASTM mode)
- TCP/IP: Ethernet network connection (ASTM over TCP or HL7 over TCP)

**Our configuration:** TCP/IP on port 5000 (`192.168.1.60:5000`), using ASTM protocol.

**Which is more commonly used?** ASTM over TCP/IP is the most common configuration for the Maglumi X3 in practice. The serial option exists for backward compatibility, but since the X3 has a built-in network card, TCP/IP is preferred for reliability and speed.

**ASTM specifics:**
- Standard ASTM E1394 message format (same H/P/O/R/L record structure)
- Communication is bidirectional: host can send worklists, instrument uploads results
- The TCP connection follows the ASTM low-level protocol wrapped in TCP (ENQ/ACK handshake still applies over TCP)
- Default delimiters: `|` (field), `\` (repeat), `^` (component), `&` (escape)

**Snibe-specific quirks:**
- The Maglumi uses Snibe-proprietary test code numbers in the ASTM result records
- Test codes are numeric and correspond to the Snibe reagent catalog
- The instrument identifies itself in the Header record as `MAGLUMI X3^Snibe` (or similar)
- TCP port 5000 is the default; the instrument can be configured to use other ports
- When using TCP, the middleware acts as a TCP **server** listening on the configured port, and the Maglumi connects to it as a client (this is the opposite of some other analyzers)
- The Maglumi sends results in batches -- all results for a sample in one message
- Flag values follow standard ASTM conventions (N, H, L, HH, LL)

### 6.3 Test Codes and Available Assays

The Maglumi X3 has a menu of 236+ parameters. The following are the most commonly used tests. Snibe test codes (numbers) are placed in the ASTM Result record's Universal Test ID field.

**Thyroid:**

| Snibe Code | Assay Name | LOINC Code | Unit | Reference Range (Adult) |
|------------|-----------|------------|------|------------------------|
| 0101 | TSH (3rd gen) | 11579-0 | uIU/mL | 0.27 - 4.20 |
| 0102 | Total T3 | 3053-6 | ng/mL | 0.8 - 2.0 |
| 0103 | Total T4 | 3026-2 | ug/dL | 5.1 - 14.1 |
| 0104 | Free T3 | 3051-0 | pg/mL | 2.0 - 4.4 |
| 0105 | Free T4 | 3024-7 | ng/dL | 0.93 - 1.70 |
| 0106 | Anti-TPO | 8099-4 | IU/mL | <34 |
| 0107 | Anti-Tg | 8098-6 | IU/mL | <115 |
| 0108 | Thyroglobulin | 3013-0 | ng/mL | <77 |
| 0109 | TRAb | 11210-2 | IU/L | <1.75 |

**Reproductive / Fertility:**

| Snibe Code | Assay Name | LOINC Code | Unit |
|------------|-----------|------------|------|
| 0201 | FSH | 15067-2 | mIU/mL |
| 0202 | LH | 10501-5 | mIU/mL |
| 0203 | Prolactin | 2842-3 | ng/mL |
| 0204 | Estradiol | 2243-4 | pg/mL |
| 0205 | Progesterone | 2839-9 | ng/mL |
| 0206 | Testosterone | 2986-8 | ng/dL |
| 0207 | Total beta-HCG | 21198-7 | mIU/mL |
| 0208 | DHEA-S | 2191-5 | ug/dL |

**Tumor Markers:**

| Snibe Code | Assay Name | LOINC Code | Unit | Reference Range |
|------------|-----------|------------|------|----------------|
| 0301 | AFP | 1834-1 | ng/mL | <7.0 |
| 0302 | CEA | 2039-6 | ng/mL | <5.0 |
| 0303 | CA 125 | 10334-1 | U/mL | <35 |
| 0304 | CA 15-3 | 6875-9 | U/mL | <25 |
| 0305 | CA 19-9 | 24108-3 | U/mL | <37 |
| 0306 | Total PSA | 2857-1 | ng/mL | <4.0 |
| 0307 | Free PSA | 10886-0 | ng/mL | report with ratio |
| 0308 | CA 72-4 | 10454-7 | U/mL | <6.9 |
| 0310 | NSE | 17453-4 | ng/mL | <16.3 |
| 0311 | Cyfra 21-1 | 33717-0 | ng/mL | <3.3 |
| 0312 | SCC | 56927-9 | ng/mL | <1.5 |

**Cardiac Markers:**

| Snibe Code | Assay Name | LOINC Code | Unit | Reference Range |
|------------|-----------|------------|------|----------------|
| 0401 | hs-Troponin I | 89579-7 | pg/mL | <26.2 (99th percentile) |
| 0402 | CK-MB mass | 49551-5 | ng/mL | <4.94 |
| 0403 | Myoglobin | 30088-9 | ng/mL | <100 |
| 0404 | NT-proBNP | 33762-6 | pg/mL | age-dependent |
| 0405 | BNP | 42637-9 | pg/mL | <100 |
| 0406 | D-Dimer | 48058-2 | ug/mL FEU | <0.5 |

**Anemia / Metabolic:**

| Snibe Code | Assay Name | LOINC Code | Unit | Reference Range (Adult) |
|------------|-----------|------------|------|------------------------|
| 0501 | Ferritin | 2276-4 | ng/mL | M: 30-400; F: 15-150 |
| 0502 | Vitamin B12 | 2132-9 | pg/mL | 197 - 771 |
| 0503 | Folate | 2284-8 | ng/mL | >3.0 |
| 0504 | EPO | 2637-8 | mIU/mL | 4.3 - 29.0 |

**Bone Metabolism:**

| Snibe Code | Assay Name | LOINC Code | Unit | Reference Range |
|------------|-----------|------------|------|----------------|
| 0601 | 25-OH Vitamin D | 62292-8 | ng/mL | 30 - 100 |
| 0602 | Intact PTH | 2731-8 | pg/mL | 15 - 65 |
| 0603 | Osteocalcin | 2722-7 | ng/mL | varies by age/sex |
| 0604 | Calcitonin | 1992-7 | pg/mL | <10 |

**Diabetes:**

| Snibe Code | Assay Name | LOINC Code | Unit | Reference Range |
|------------|-----------|------------|------|----------------|
| 0701 | Insulin | 2484-4 | uU/mL | 2.6 - 24.9 |
| 0702 | C-Peptide | 1986-9 | ng/mL | 1.1 - 4.4 |

**Inflammation / Infection:**

| Snibe Code | Assay Name | LOINC Code | Unit | Reference Range |
|------------|-----------|------------|------|----------------|
| 0801 | PCT (Procalcitonin) | 75241-0 | ng/mL | <0.5 |
| 0802 | IL-6 | 26881-3 | pg/mL | <7.0 |
| 0803 | CRP (hs) | 30522-7 | mg/L | <3.0 |
| 0804 | SAA | 48803-1 | mg/L | <10 |

**Endocrine:**

| Snibe Code | Assay Name | LOINC Code | Unit |
|------------|-----------|------------|------|
| 0901 | Cortisol | 2143-6 | ug/dL |
| 0902 | Growth Hormone | 2963-7 | ng/mL |
| 0903 | ACTH | 2141-0 | pg/mL |
| 0904 | Aldosterone | 1763-2 | ng/dL |
| 0905 | Renin | 2915-5 | uU/mL |

**Notes:**
- Snibe test codes follow a category-based numbering system: 01xx = Thyroid, 02xx = Fertility, 03xx = Tumor, 04xx = Cardiac, 05xx = Anemia, 06xx = Bone, 07xx = Diabetes, 08xx = Inflammation, 09xx = Endocrine.
- Exact code numbers may vary by instrument software version. The codes above are representative of the Maglumi numbering convention. Always verify against the specific instrument's LIS interface configuration.
- The Maglumi also offers extensive infectious disease panels (HIV, Hepatitis, TORCH, etc.) which are not listed here as they are beyond the typical scope of our lab's test menu.

---

## 7. Complete LOINC Reference Tables

These tables serve as the master reference for mapping test results from any analyzer to FHIR Observation resources. Each row includes the LOINC code, standard units, and typical reference ranges for adult populations.

### 7.1 Basic Metabolic Panel (BMP)

LOINC Panel Code: **51990-0** (Basic metabolic panel - Blood) or **24321-2** (BMP 2000 - Serum or Plasma)

| Test | Common Name | LOINC Code | Unit | Reference Range (Adult) | Critical Values |
|------|------------|------------|------|------------------------|----------------|
| Glucose | Fasting Blood Glucose | 2345-7 | mg/dL | 70 - 100 | <40 or >500 |
| Glucose (fasting, serum) | Fasting Glucose | 1558-6 | mg/dL | 70 - 100 | <40 or >500 |
| BUN | Blood Urea Nitrogen | 3094-0 | mg/dL | 6 - 24 | >100 |
| Creatinine | Serum Creatinine | 2160-0 | mg/dL | M: 0.74-1.35; F: 0.59-1.04 | >10.0 |
| Sodium | Serum Sodium | 2951-2 | mmol/L | 136 - 145 | <120 or >160 |
| Potassium | Serum Potassium | 2823-3 | mmol/L | 3.5 - 5.1 | <2.5 or >6.5 |
| Chloride | Serum Chloride | 2075-0 | mmol/L | 98 - 106 | <80 or >120 |
| CO2 (Bicarbonate) | Total CO2 | 2028-9 | mmol/L | 22 - 29 | <10 or >40 |
| Calcium | Serum Calcium | 17861-6 | mg/dL | 8.6 - 10.2 | <6.0 or >13.0 |
| BUN/Creatinine Ratio | BUN/Cr Ratio | 44734-2 | -- | 10 - 20 | -- |
| Anion Gap | Anion Gap (calc.) | 41276-7 | mmol/L | 3 - 11 | -- |

### 7.2 Liver Function Panel (Hepatic Function)

LOINC Panel Code: **24325-3** (Hepatic function 2000 panel - Serum or Plasma)

| Test | Common Name | LOINC Code | Unit | Reference Range (Adult) | Critical Values |
|------|------------|------------|------|------------------------|----------------|
| ALT | ALT (SGPT) | 1742-6 | U/L | M: 7-56; F: 7-45 | >1000 |
| AST | AST (SGOT) | 1920-8 | U/L | M: 10-40; F: 9-32 | >1000 |
| ALP | Alkaline Phosphatase | 6768-6 | U/L | 44 - 147 | -- |
| GGT | Gamma-GT | 2324-2 | U/L | M: 8-61; F: 5-36 | -- |
| Total Bilirubin | Total Bilirubin | 1975-2 | mg/dL | 0.1 - 1.2 | >15.0 (adult); >20.0 (neonate) |
| Direct Bilirubin | Direct Bilirubin | 1968-7 | mg/dL | 0.0 - 0.3 | -- |
| Albumin | Serum Albumin | 1751-7 | g/dL | 3.4 - 5.4 | <1.5 |
| Total Protein | Total Protein | 2885-2 | g/dL | 6.0 - 8.3 | <3.0 or >12.0 |

### 7.3 Lipid Panel

LOINC Panel Code: **57698-3** (Lipid panel with direct LDL)

| Test | Common Name | LOINC Code | Unit | Desirable Range (Adult) | High Risk |
|------|------------|------------|------|------------------------|-----------|
| Total Cholesterol | Total Cholesterol | 2093-3 | mg/dL | <200 | >240 |
| HDL Cholesterol | HDL-C | 2085-9 | mg/dL | >40 (M); >50 (F) | <35 |
| LDL Cholesterol (direct) | LDL-C | 2089-1 | mg/dL | <100 (optimal) | >190 |
| LDL Cholesterol (calc.) | LDL-C (calculated) | 13457-7 | mg/dL | <100 (optimal) | >190 |
| Triglycerides | Triglycerides | 2571-8 | mg/dL | <150 | >500 (pancreatitis risk) |
| Total/HDL Ratio | Chol/HDL Ratio | 9830-1 | -- | <5.0 | >5.0 |
| VLDL (calculated) | VLDL-C | 13458-5 | mg/dL | 5 - 40 | -- |

### 7.4 Thyroid Panel

| Test | Common Name | LOINC Code | Unit | Reference Range (Adult) | Critical Values |
|------|------------|------------|------|------------------------|----------------|
| TSH | TSH (3rd gen, sensitive) | 11579-0 | uIU/mL | 0.27 - 4.20 | <0.01 or >100 |
| Free T4 | Free Thyroxine | 3024-7 | ng/dL | 0.93 - 1.70 | <0.4 or >6.0 |
| Free T3 | Free Triiodothyronine | 3051-0 | pg/mL | 2.0 - 4.4 | >20 |
| Total T4 | Total Thyroxine | 3026-2 | ug/dL | 5.1 - 14.1 | -- |
| Total T3 | Total Triiodothyronine | 3053-6 | ng/dL | 80 - 200 | -- |
| Anti-TPO | Anti-Thyroid Peroxidase | 8099-4 | IU/mL | <34 | -- |
| Anti-Tg | Anti-Thyroglobulin | 8098-6 | IU/mL | <115 | -- |
| Thyroglobulin | Thyroglobulin | 3013-0 | ng/mL | <77 | -- |
| TRAb | TSH Receptor Antibody | 11210-2 | IU/L | <1.75 | -- |

### 7.5 Cardiac Markers

| Test | Common Name | LOINC Code | Unit | Reference Range | Critical Values |
|------|------------|------------|------|----------------|----------------|
| hs-Troponin T | High-sensitivity Troponin T | 67151-1 | pg/mL | <14 (99th pctile) | >52 (myocardial injury) |
| hs-Troponin I | High-sensitivity Troponin I | 89579-7 | pg/mL | <26.2 (99th pctile) | varies by assay |
| Troponin I | Troponin I (standard) | 49563-0 | ng/mL | <0.04 | >0.40 |
| Troponin T | Troponin T (standard) | 6598-7 | ng/mL | <0.01 | >0.10 |
| CK-MB mass | CK-MB (mass) | 49551-5 | ng/mL | <4.94 | >25 |
| Myoglobin | Myoglobin | 30088-9 | ng/mL | M: 28-72; F: 25-58 | >500 |
| NT-proBNP | NT-proBNP | 33762-6 | pg/mL | <125 (age <75) | >450 (heart failure) |
| BNP | BNP | 42637-9 | pg/mL | <100 | >400 |
| D-Dimer | D-Dimer | 48058-2 | ug/mL FEU | <0.5 | >4.0 |

### 7.6 HbA1c and Diabetes Markers

| Test | Common Name | LOINC Code | Unit | Reference Range | Clinical Targets |
|------|------------|------------|------|----------------|-----------------|
| HbA1c (DCCT/NGSP) | Hemoglobin A1c (%) | 4548-4 | % | 4.0 - 5.6 | <7.0 (diabetic); >6.5 (diagnostic cutoff) |
| HbA1c (IFCC) | Hemoglobin A1c (mmol/mol) | 59261-8 | mmol/mol | 20 - 38 | <53 (diabetic); >48 (diagnostic) |
| Insulin | Fasting Insulin | 2484-4 | uU/mL | 2.6 - 24.9 | -- |
| C-Peptide | C-Peptide | 1986-9 | ng/mL | 1.1 - 4.4 | -- |
| Fructosamine | Fructosamine | 4471-9 | umol/L | 200 - 285 | -- |

### 7.7 Hemoglobin Variants (Bio-Rad D-10)

| Test | Common Name | LOINC Code | Unit | Reference Range | Significance |
|------|------------|------------|------|----------------|-------------|
| HbA2 | Hemoglobin A2 | 4551-8 | % | 2.0 - 3.3 | >3.5 = beta-thalassemia trait |
| HbF | Fetal Hemoglobin | 4576-5 | % | <1.0 (adult) | Elevated in hereditary persistence, thalassemia |
| HbS | Hemoglobin S | 35499-4 | % | 0 (absent) | Present = sickle cell trait/disease |
| HbC | Hemoglobin C | 30350-3 | % | 0 (absent) | Present = HbC trait/disease |

### 7.8 Iron Studies

| Test | Common Name | LOINC Code | Unit | Reference Range (Adult) |
|------|------------|------------|------|------------------------|
| Ferritin | Ferritin | 2276-4 | ng/mL | M: 30-400; F: 15-150 |
| Iron | Serum Iron | 2498-4 | ug/dL | M: 65-175; F: 50-170 |
| TIBC | Total Iron Binding Capacity | 2500-7 | ug/dL | 250 - 400 |
| Transferrin Sat. | Transferrin Saturation | 2502-3 | % | 20 - 50 |

### 7.9 Other Common Tests

| Test | Common Name | LOINC Code | Unit | Reference Range (Adult) |
|------|------------|------------|------|------------------------|
| 25-OH Vitamin D | Vitamin D (total) | 62292-8 | ng/mL | 30-100 (sufficient); 20-29 (insufficient); <20 (deficient) |
| Vitamin B12 | Vitamin B12 | 2132-9 | pg/mL | 197 - 771 |
| Folate | Serum Folate | 2284-8 | ng/mL | >3.0 |
| Total PSA | Prostate-Specific Antigen | 2857-1 | ng/mL | <4.0 |
| Free PSA | Free PSA | 10886-0 | ng/mL | report with ratio |
| Prolactin | Prolactin | 2842-3 | ng/mL | M: 4.04-15.2; F: 4.79-23.3 |
| Cortisol | Cortisol (AM) | 2143-6 | ug/dL | AM: 6.2-19.4; PM: 2.3-11.9 |
| ACTH | ACTH | 2141-0 | pg/mL | 7.2 - 63.3 |
| Intact PTH | Parathyroid Hormone | 2731-8 | pg/mL | 15 - 65 |
| CRP (standard) | C-Reactive Protein | 1988-5 | mg/L | <10 |
| hsCRP | High-Sensitivity CRP | 30522-7 | mg/L | <1.0 (low risk); 1-3 (avg risk); >3.0 (high risk) |
| Procalcitonin | PCT | 75241-0 | ng/mL | <0.05 (normal); 0.05-0.5 (low risk); >2.0 (severe sepsis) |
| LDH | Lactate Dehydrogenase | 2532-0 | U/L | 120 - 246 |
| CK | Creatine Kinase | 2157-6 | U/L | M: 39-308; F: 26-192 |
| Amylase | Amylase (Pancreatic) | 1798-8 | U/L | 13 - 53 |
| Lipase | Lipase | 3040-3 | U/L | 13 - 60 |
| Uric Acid | Uric Acid | 3084-1 | mg/dL | M: 3.4-7.0; F: 2.4-5.7 |
| Phosphorus | Phosphorus (Inorganic) | 2777-1 | mg/dL | 2.5 - 4.5 |
| Magnesium | Magnesium | 19123-9 | mg/dL | 1.7 - 2.2 |
| CEA | Carcinoembryonic Antigen | 2039-6 | ng/mL | <3.4 (non-smoker); <5.0 (smoker) |
| AFP | Alpha-Fetoprotein | 1834-1 | ng/mL | <7.0 |
| CA 125 | CA 125 | 10334-1 | U/mL | <35 |
| CA 19-9 | CA 19-9 | 24108-3 | U/mL | <37 |
| CA 15-3 | CA 15-3 | 6875-9 | U/mL | <25 |
| Total HCG | Total beta-HCG | 21198-7 | mIU/mL | <5.0 (non-pregnant) |
| IL-6 | Interleukin-6 | 26881-3 | pg/mL | <7.0 |
| Homocysteine | Homocysteine | 13965-9 | umol/L | 5.0 - 15.0 |
| Cystatin C | Cystatin C | 33863-2 | mg/L | 0.53 - 0.95 |

---

## 8. Flag/Interpretation Mapping

### 8.1 Analyzer Abnormal Flags (ASTM)

All Roche cobas analyzers (c111, e411, Hitachi) and most ASTM-compliant instruments use the following abnormal flag values in the Result record field 7:

| ASTM Flag | Meaning | When Used |
|-----------|---------|-----------|
| N | Normal | Result is within reference range |
| L | Low | Result is below the lower limit of the reference range |
| H | High | Result is above the upper limit of the reference range |
| LL | Critically Low (Panic Low) | Result is below the panic/critical low limit |
| HH | Critically High (Panic High) | Result is above the panic/critical high limit |
| A | Abnormal | Result is abnormal but direction is not specified |
| < | Below Analytical Range | Result is below the lowest measurable value |
| > | Above Analytical Range | Result is above the highest measurable value |

**Additional Roche-specific flags:**
- Some Roche instruments may include dilution information in the flags field (e.g., "N^D:2" for normal result with 1:2 dilution)
- The e411 may report "F" in the result status field for flagged results (not to be confused with "F" = Final in the result status)
- Error conditions may be reported as special flags like "*" or "E"

### 8.2 FHIR Observation.interpretation Mapping

The FHIR R4 Observation resource uses the `interpretation` field with codes from the `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation` code system. Here is the mapping from analyzer flags to FHIR interpretation codes:

| Analyzer Flag | FHIR Code | FHIR Display | FHIR System |
|---------------|-----------|-------------|-------------|
| N | N | Normal | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |
| L | L | Low | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |
| H | H | High | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |
| LL | LL | Critical low | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |
| HH | HH | Critical high | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |
| A | A | Abnormal | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |
| < | < | Off scale low | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |
| > | > | Off scale high | http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation |

**Additional FHIR interpretation codes that may be useful:**

| FHIR Code | Display | Use Case |
|-----------|---------|----------|
| HU | Significantly high | Between H and HH |
| LU | Significantly low | Between L and LL |
| AA | Critical abnormal | Non-directional critical |
| POS | Positive | Qualitative positive (e.g., infectious disease) |
| NEG | Negative | Qualitative negative |
| DET | Detected | Qualitative detected |
| ND | Not detected | Qualitative not detected |
| W | Worse | Compared to previous result |
| B | Better | Compared to previous result |

### 8.3 Implementation in FHIR Observation

When creating a FHIR Observation resource from an analyzer result, the interpretation mapping looks like this:

```json
{
  "resourceType": "Observation",
  "status": "final",
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "2345-7",
      "display": "Glucose [Mass/volume] in Serum or Plasma"
    }]
  },
  "valueQuantity": {
    "value": 126,
    "unit": "mg/dL",
    "system": "http://unitsofmeasure.org",
    "code": "mg/dL"
  },
  "interpretation": [{
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
      "code": "H",
      "display": "High"
    }]
  }],
  "referenceRange": [{
    "low": {
      "value": 70,
      "unit": "mg/dL",
      "system": "http://unitsofmeasure.org",
      "code": "mg/dL"
    },
    "high": {
      "value": 100,
      "unit": "mg/dL",
      "system": "http://unitsofmeasure.org",
      "code": "mg/dL"
    },
    "text": "70 - 100 mg/dL"
  }]
}
```

### 8.4 Result Status Mapping

The ASTM Result record field 9 contains the result status. Map to FHIR Observation.status:

| ASTM Status | Meaning | FHIR Observation.status |
|-------------|---------|------------------------|
| F | Final | final |
| P | Preliminary | preliminary |
| C | Corrected | corrected |
| X | Cancelled | cancelled |
| I | Pending/Incomplete | registered |
| R | Revised/Repeated | amended |

---

## 9. Sources

### Primary (High Credibility)

1. **Roche Cobas c111 Host Interface Manual** -- Official Roche documentation; referenced via [ManualsLib](https://www.manualslib.com/manual/1218310/Roche-Cobas-C111.html) and [Manualzz](https://manualzz.com/doc/54717528/roche-cobas-c111-manual)
2. **Roche Cobas e411 Host Interface Manual v2.2** -- Official Roche documentation; referenced via [SENAITE Community](https://community.senaite.org/uploads/short-url/rYdQadmOAcZfwvVi8FWLcSdgMSS.pdf) and [Bika LIMS](https://www.bikalims.org/downloads/instrument-interface-specifications/cobas-e411)
3. **Bio-Rad D-10 LIS Manual** -- Official Bio-Rad documentation; referenced via [Scribd](https://www.scribd.com/document/475859984/D-10-LIS-manual) and [PDFCOFFEE](https://pdfcoffee.com/d-10-lis-manual-pdf-free.html)
4. **LOINC Database** -- [loinc.org](https://loinc.org) -- authoritative source for all LOINC codes
5. **FHIR R4 ValueSet: observation-interpretation** -- [HL7 FHIR R4](https://www.hl7.org/fhir/R4/valueset-observation-interpretation.html)
6. **HCUP LOINC Code Reference** -- [AHRQ](https://hcup-us.ahrq.gov/datainnovations/clinicaldata/AppendixO_LabDataVariablesandRelevantRanges.jsp)

### Secondary (Medium Credibility)

7. **SENAITE ASTM Middleware** -- [GitHub](https://github.com/senaite/senaite.astm) -- open-source ASTM middleware with cobas c111 test data
8. **SENAITE Community Forum** -- [senaite.org](https://community.senaite.org/t/using-senaite-astm-to-transfer-data-from-cobas-c111-analyzer-to-senaite/1293) -- real cobas c111 ASTM message samples
9. **Snibe Official Website** -- [snibe.com](https://www.snibe.com/en/product/CLIA_menu/) -- Maglumi X3 test menu
10. **Tosoh Bioscience Official Website** -- [diagnostics.us.tosohbioscience.com](https://www.diagnostics.us.tosohbioscience.com/analyzers/aia-360) -- AIA-360 specifications and test menu
11. **Roche Diagnostics Global** -- [diagnostics.roche.com](https://diagnostics.roche.com/global/en/products/instruments/cobas-c-111-ins-526.html) -- product specifications
12. **ASTM E1394 Message Format Reference** -- [twgenaux.github.io](https://twgenaux.github.io/MessageFormats/MessageFormats) -- ASTM message format documentation

### Tertiary (Reference)

13. **CLSI LIS1-A / LIS2-A2 Standards** -- Referenced throughout; official standards documents not freely available
14. **Roche cobas c111 Operator's Manual v3.0** -- Referenced but not fully accessible online
15. **Block Scientific Equipment Listings** -- [blockscientific.com](https://www.blockscientific.com) -- analyzer specifications

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| ASTM protocol format (framing, checksums, handshake) | 95% | Well-documented standard; confirmed with real messages |
| Roche cobas c111 ACN codes | 70% | Some codes confirmed from real messages (413, 685, 687, 690, 767); others inferred from Roche reagent naming conventions; full ACN table not publicly available |
| Roche cobas e411 test numbers | 65% | Test numbers (146, 142, 143, etc.) are representative of Elecsys numbering; actual numbers may vary by firmware version |
| Bio-Rad D-10 protocol and test codes | 85% | Well-documented in the D-10 LIS manual; confirmed message format |
| Tosoh AIA-360 test codes | 60% | Test abbreviations confirmed; exact ASTM codes less certain without official LIS manual |
| Snibe Maglumi X3 test codes | 55% | Category-based numbering (01xx, 02xx, etc.) is representative; exact codes need verification with actual instrument |
| LOINC code assignments | 95% | Sourced directly from loinc.org; these are standardized |
| Reference ranges | 75% | Ranges are typical adult population defaults; actual ranges vary by lab, method, and population |
| FHIR interpretation mapping | 95% | Sourced directly from HL7 FHIR R4 specification |

### What Would Change These Conclusions

- **Access to actual instrument Host Interface Manuals** would increase confidence on test codes to 95%+
- **Connecting to the actual instruments in the lab** would provide definitive test code mapping
- **Roche country-specific reagent catalogs** would confirm ACN/test number assignments for our specific market

### Recommendations for Implementation

1. **Start with the ASTM parser** -- it is shared across all Roche instruments, Bio-Rad D-10, Tosoh AIA-360, and Snibe Maglumi X3. The protocol is well-understood.
2. **Make test code mapping configurable** -- store in JSON mapping files, not in code. Hospital IT must be able to adjust mappings without code changes.
3. **Verify codes against real instruments** -- once connected to actual lab analyzers, capture sample messages and validate the test code mappings documented here.
4. **For Hitachi 917/7180** -- channel numbers are installation-specific; the mapping file MUST be populated from the actual instrument configuration.
5. **For Snibe Maglumi X3** -- verify TCP connectivity pattern (Maglumi as TCP client connecting to our server on port 5000).
6. **Use LOINC codes as the canonical identifier** -- the per-analyzer test code is just an alias; the LOINC code is what goes into the FHIR Observation.
