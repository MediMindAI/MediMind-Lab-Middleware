# Hematology Analyzer Research: Sysmex XN-550 and Mindray BC-3510

**Date:** 2026-03-05
**Purpose:** Reference document for building test code mapping files in the MediMind Lab Middleware
**Confidence Level:** High for LOINC codes and parameter lists; Medium for exact ASTM/HL7 test code identifiers (manufacturer documentation not fully publicly available)

---

## Table of Contents

1. [Sysmex XN-550 (Hematology -- CBC)](#1-sysmex-xn-550)
2. [Mindray BC-3510 (Hematology -- CBC)](#2-mindray-bc-3510)
3. [Complete CBC LOINC Code Reference Table](#3-complete-cbc-loinc-code-reference-table)
4. [Reference Ranges](#4-reference-ranges)
5. [Flag Mapping](#5-flag-mapping)
6. [Sample Messages](#6-sample-messages)
7. [Implementation Notes](#7-implementation-notes)
8. [Sources](#8-sources)

---

## 1. Sysmex XN-550

### 1.1 Protocol Overview

The Sysmex XN-550 communicates using **ASTM E1381-02 / E1394-97** (now known as CLSI LIS1-A / LIS2-A2). This is the standard "low-level protocol" (ENQ/ACK/NAK/EOT handshake with STX/ETX framing and checksums) combined with the "presentation layer" that defines record types (H, P, O, R, C, Q, L).

- **Connection:** Serial (RS-232) and/or Ethernet (TCP/IP)
- **Default Serial Settings:** 9600 baud, 8 data bits, no parity, 1 stop bit (8-N-1)
- **Direction:** Bidirectional (can receive orders and send results)
- **Interface Spec Document:** "XN-550 Series ASTM Host Interface Specifications" (Sysmex document R315005, Rev 6) and "XN Series ASTM Host Interface Specifications" (R311016, Ver 10.0)

### 1.2 Reportable Parameters (23 CBC+DIFF Parameters)

The XN-550 is a 6-part differential analyzer. In whole blood mode it reports 23 base parameters (plus optional reticulocyte and body fluid parameters with additional licenses).

| # | Abbreviation | Full Name | Unit | Notes |
|---|-------------|-----------|------|-------|
| 1 | WBC | White Blood Cell Count | 10^3/uL (10^9/L) | Total leukocyte count |
| 2 | RBC | Red Blood Cell Count | 10^6/uL (10^12/L) | Total erythrocyte count |
| 3 | HGB | Hemoglobin | g/dL | SLS-hemoglobin (cyanide-free) method |
| 4 | HCT | Hematocrit | % | Cumulative pulse height detection |
| 5 | MCV | Mean Corpuscular Volume | fL | Calculated or direct measurement |
| 6 | MCH | Mean Corpuscular Hemoglobin | pg | Calculated: HGB / RBC |
| 7 | MCHC | Mean Corpuscular Hemoglobin Concentration | g/dL | Calculated: HGB / HCT |
| 8 | PLT | Platelet Count | 10^3/uL (10^9/L) | Impedance method (PLT-I) by default |
| 9 | NEUT% | Neutrophil Percentage | % | Of total WBC |
| 10 | NEUT# | Neutrophil Absolute Count | 10^3/uL | Absolute count |
| 11 | LYMPH% | Lymphocyte Percentage | % | Of total WBC |
| 12 | LYMPH# | Lymphocyte Absolute Count | 10^3/uL | Absolute count |
| 13 | MONO% | Monocyte Percentage | % | Of total WBC |
| 14 | MONO# | Monocyte Absolute Count | 10^3/uL | Absolute count |
| 15 | EO% | Eosinophil Percentage | % | Of total WBC |
| 16 | EO# | Eosinophil Absolute Count | 10^3/uL | Absolute count |
| 17 | BASO% | Basophil Percentage | % | Of total WBC |
| 18 | BASO# | Basophil Absolute Count | 10^3/uL | Absolute count |
| 19 | RDW-SD | Red Cell Distribution Width (SD) | fL | Standard deviation of RBC volume |
| 20 | RDW-CV | Red Cell Distribution Width (CV) | % | Coefficient of variation of RBC volume |
| 21 | PDW | Platelet Distribution Width | fL | Width of platelet volume distribution |
| 22 | MPV | Mean Platelet Volume | fL | Average platelet size |
| 23 | P-LCR | Platelet Large Cell Ratio | % | Ratio of platelets > 12 fL |

**Additional parameters reported (not part of the standard 23):**

| Abbreviation | Full Name | Unit | Notes |
|-------------|-----------|------|-------|
| PCT | Plateletcrit | % | Total platelet volume fraction |
| NRBC% | Nucleated RBC Percentage | % | Per 100 WBC |
| NRBC# | Nucleated RBC Absolute Count | 10^3/uL | Included with every CBC on XN-series |
| IG% | Immature Granulocyte Percentage | % | Metamyelocytes + myelocytes + promyelocytes |
| IG# | Immature Granulocyte Absolute Count | 10^3/uL | Absolute IG count |

**Optional parameters (require RET license):**

| Abbreviation | Full Name | Unit |
|-------------|-----------|------|
| RET% | Reticulocyte Percentage | % |
| RET# | Reticulocyte Absolute Count | 10^6/uL |
| IRF | Immature Reticulocyte Fraction | % |
| LFR | Low Fluorescence Reticulocyte Fraction | % |
| MFR | Medium Fluorescence Reticulocyte Fraction | % |
| HFR | High Fluorescence Reticulocyte Fraction | % |
| RET-He | Reticulocyte Hemoglobin Equivalent | pg |
| PLT-F | Fluorescent Platelet Count | 10^3/uL |
| IPF | Immature Platelet Fraction | % |

### 1.3 ASTM Test Codes (Universal Test ID Field)

In the ASTM E1394 Result (R) record, the test is identified in **field R.3** (Universal Test ID). The format uses caret (^) as the component separator within the field:

```
^^^<TestAbbreviation>
```

The three leading carets represent empty components (manufacturer code, instrument code, test code) before the "local test code" component. For Sysmex XN-series analyzers, the **test name sent in R.3 matches the parameter abbreviation** from the "Assay Group Setting" in the analyzer's configuration.

**Sysmex XN-550 ASTM Test Code Table:**

| Parameter | ASTM Test ID (R.3 field) | Notes |
|-----------|-------------------------|-------|
| WBC | `^^^WBC` | White blood cell count |
| RBC | `^^^RBC` | Red blood cell count |
| HGB | `^^^HGB` | Hemoglobin |
| HCT | `^^^HCT` | Hematocrit |
| MCV | `^^^MCV` | Mean corpuscular volume |
| MCH | `^^^MCH` | Mean corpuscular hemoglobin |
| MCHC | `^^^MCHC` | Mean corpuscular hemoglobin concentration |
| PLT | `^^^PLT` | Platelet count (PLT-I by default) |
| NEUT% | `^^^NEUT%` | Neutrophil percentage |
| NEUT# | `^^^NEUT#` | Neutrophil absolute count |
| LYMPH% | `^^^LYMPH%` | Lymphocyte percentage |
| LYMPH# | `^^^LYMPH#` | Lymphocyte absolute count |
| MONO% | `^^^MONO%` | Monocyte percentage |
| MONO# | `^^^MONO#` | Monocyte absolute count |
| EO% | `^^^EO%` | Eosinophil percentage |
| EO# | `^^^EO#` | Eosinophil absolute count |
| BASO% | `^^^BASO%` | Basophil percentage |
| BASO# | `^^^BASO#` | Basophil absolute count |
| RDW-SD | `^^^RDW-SD` | RBC distribution width (SD) |
| RDW-CV | `^^^RDW-CV` | RBC distribution width (CV) |
| PDW | `^^^PDW` | Platelet distribution width |
| MPV | `^^^MPV` | Mean platelet volume |
| P-LCR | `^^^P-LCR` | Platelet large cell ratio |
| PCT | `^^^PCT` | Plateletcrit |
| NRBC% | `^^^NRBC%` | Nucleated RBC percentage |
| NRBC# | `^^^NRBC#` | Nucleated RBC absolute count |
| IG% | `^^^IG%` | Immature granulocyte percentage |
| IG# | `^^^IG#` | Immature granulocyte absolute count |
| PLT-F | `^^^PLT-F` | Fluorescent platelet count |
| RET% | `^^^RET%` | Reticulocyte percentage |
| RET# | `^^^RET#` | Reticulocyte absolute count |
| RET-He | `^^^RET-He` | Reticulocyte hemoglobin equivalent |
| IRF | `^^^IRF` | Immature reticulocyte fraction |
| IPF | `^^^IPF` | Immature platelet fraction |

**IMPORTANT NOTE:** The exact test code strings are configurable in the Sysmex XN analyzer's "Assay Group Setting" screen. The values above are the **factory defaults**. Your specific analyzer may have been configured with different abbreviations. Always verify against the actual analyzer configuration during commissioning.

### 1.4 Sysmex-Specific ASTM Quirks and Deviations

1. **Configurable Test IDs:** Unlike some analyzers that use fixed numeric codes, Sysmex XN uses text abbreviations that can be customized in the analyzer settings. The middleware should match test IDs case-sensitively.

2. **NRBC on every run:** The XN-series reports NRBC (nucleated red blood cells) with every CBC automatically. Many other analyzers do not report this. The middleware must handle NRBC even if not specifically ordered.

3. **PLT-I vs PLT-F:** The analyzer can report platelet counts from two different channels: PLT-I (impedance, default) and PLT-F (fluorescent, more accurate). If PLT-F is enabled, both may be transmitted. The middleware should map both to the same LOINC code but may want to prefer PLT-F when available.

4. **IG included in differential:** The XN-550 provides a 6-part differential (NEUT, LYMPH, MONO, EO, BASO, IG). The IG count is NOT a subset of NEUT -- it is reported separately. Traditional 5-part differentials do not include IG.

5. **Unit format in R.4:** Sysmex typically sends units in the R.4 result field rather than a separate unit field. The unit may appear as `10*3/uL` or `10^3/uL` or `x10E3/uL` depending on analyzer configuration.

6. **Abnormal flags:** Sysmex places flags in the R.6 field (Result Abnormal Flags). Common values: `N` (normal), `H` (high), `L` (low), `HH` (critically high), `LL` (critically low).

7. **Comment records:** Sysmex frequently sends C (Comment) records after R records containing instrument flags like "WBC Abnormal Scattergram", "PLT Clumps?", "Blasts?", etc. These are analyzer-generated alerts and should be logged but not mapped to FHIR Observation values.

8. **Multiple ASTM sessions:** For a single sample, Sysmex may send results across multiple ASTM sessions (ENQ...EOT blocks), especially when reticulocyte results follow CBC results. The middleware must aggregate results by specimen ID.

---

## 2. Mindray BC-3510

### 2.1 Protocol Overview

The Mindray BC-3510 is a **3-part differential** hematology analyzer. Based on the project spec, it supports both **HL7 v2.3.1** and **ASTM E1394** over serial (DB-9 RS-232).

- **Connection:** Serial (DB-9 RS-232)
- **Default Serial Settings:** 9600 baud, 8 data bits, no parity, 1 stop bit
- **Direction:** Bidirectional
- **Primary Protocol:** HL7 v2.3.1 over MLLP (or bare TCP for serial)
- **Alternative Protocol:** ASTM E1394 (configurable in analyzer settings)

**Note on Model Number:** The BC-3510 is not widely documented in public sources. It appears to be a regional variant in the Mindray BC-3000/BC-3200/BC-3600 family of 3-part differential analyzers. The protocol and parameter set are consistent across this product family. The BC-3600 has the most publicly available documentation and is used here as the primary reference for the BC-3510's behavior.

### 2.2 Reportable Parameters (19 Parameters + 3 Histograms)

The Mindray BC-3510 (3-part differential) reports 19 CBC parameters plus 3 histograms:

| # | Abbreviation | Full Name | Unit | Notes |
|---|-------------|-----------|------|-------|
| 1 | WBC | White Blood Cell Count | 10^3/uL (10^9/L) | Impedance method |
| 2 | Lymph# | Lymphocyte Absolute Count | 10^3/uL | 3-part differential |
| 3 | Mid# | Mid-Cell Absolute Count | 10^3/uL | Monocytes + eosinophils + basophils |
| 4 | Gran# | Granulocyte Absolute Count | 10^3/uL | Neutrophils + bands |
| 5 | Lymph% | Lymphocyte Percentage | % | Of total WBC |
| 6 | Mid% | Mid-Cell Percentage | % | Of total WBC |
| 7 | Gran% | Granulocyte Percentage | % | Of total WBC |
| 8 | RBC | Red Blood Cell Count | 10^6/uL (10^12/L) | Impedance method |
| 9 | HGB | Hemoglobin | g/dL | Colorimetric (SLS) method |
| 10 | HCT | Hematocrit | % | Calculated from MCV and RBC |
| 11 | MCV | Mean Corpuscular Volume | fL | Direct measurement |
| 12 | MCH | Mean Corpuscular Hemoglobin | pg | Calculated: HGB / RBC |
| 13 | MCHC | Mean Corpuscular Hemoglobin Concentration | g/dL | Calculated: HGB / HCT |
| 14 | RDW-CV | Red Cell Distribution Width (CV) | % | Coefficient of variation |
| 15 | RDW-SD | Red Cell Distribution Width (SD) | fL | Standard deviation |
| 16 | PLT | Platelet Count | 10^3/uL (10^9/L) | Impedance method |
| 17 | MPV | Mean Platelet Volume | fL | Average platelet size |
| 18 | PDW | Platelet Distribution Width | fL | Width of PLT distribution |
| 19 | PCT | Plateletcrit | % | Total platelet volume fraction |

**Histograms (transmitted as data but typically not mapped to FHIR):**
- WBC histogram
- RBC histogram
- PLT histogram

### 2.3 HL7 v2.3.1 Message Format

The Mindray BC-3510 sends results as **ORU^R01** (Unsolicited Observation Result) messages. Based on the Mindray BC-series HL7 implementation:

**MSH Segment Example:**
```
MSH|^~\&|BC-3510|Mindray|||20260305143000||ORU^R01|1|P|2.3.1||||||UNICODE
```

**OBX Segment Format:**
```
OBX|<seq>|NM|<code>^<name>^<coding-system>||<value>|<unit>|<ref-range>|<flag>|||F
```

### 2.4 Mindray BC-3510 HL7 OBX Observation Identifiers

Mindray hematology analyzers can be configured to send either **LOINC codes** or **proprietary Mindray test codes** in OBX-3 (Observation Identifier). The configuration depends on the LIS setup.

**When configured with LOINC codes (recommended):**

| Parameter | OBX-3 (Observation ID) | OBX-5 (Value) | OBX-6 (Unit) |
|-----------|----------------------|----------------|---------------|
| WBC | `6690-2^WBC^LN` | numeric | 10*9/L |
| Lymph# | `731-0^Lymphocytes^LN` | numeric | 10*9/L |
| Mid# | `5905-5^Monocytes^LN` (see note) | numeric | 10*9/L |
| Gran# | `751-8^Neutrophils^LN` (see note) | numeric | 10*9/L |
| Lymph% | `736-9^Lymphocytes%^LN` | numeric | % |
| Mid% | `5905-5^Monocytes%^LN` (see note) | numeric | % |
| Gran% | `770-8^Neutrophils%^LN` (see note) | numeric | % |
| RBC | `789-8^RBC^LN` | numeric | 10*12/L |
| HGB | `718-7^HGB^LN` | numeric | g/dL |
| HCT | `4544-3^HCT^LN` | numeric | % |
| MCV | `787-2^MCV^LN` | numeric | fL |
| MCH | `785-6^MCH^LN` | numeric | pg |
| MCHC | `786-4^MCHC^LN` | numeric | g/dL |
| RDW-CV | `788-0^RDW^LN` | numeric | % |
| RDW-SD | `21000-5^RDW-SD^LN` | numeric | fL |
| PLT | `777-3^PLT^LN` | numeric | 10*9/L |
| MPV | `32623-1^MPV^LN` | numeric | fL |
| PDW | `32207-3^PDW^LN` | numeric | fL |
| PCT | `51637-7^PCT^LN` | numeric | % |

**When configured with Mindray proprietary codes:**

| Parameter | OBX-3 (Observation ID) | Notes |
|-----------|----------------------|-------|
| WBC | `WBC^WBC^99MRC` | 99MRC = Mindray local code system |
| Lymph# | `Lymph#^Lymph#^99MRC` | |
| Mid# | `Mid#^Mid#^99MRC` | |
| Gran# | `Gran#^Gran#^99MRC` | |
| Lymph% | `Lymph%^Lymph%^99MRC` | |
| Mid% | `Mid%^Mid%^99MRC` | |
| Gran% | `Gran%^Gran%^99MRC` | |
| RBC | `RBC^RBC^99MRC` | |
| HGB | `HGB^HGB^99MRC` | |
| HCT | `HCT^HCT^99MRC` | |
| MCV | `MCV^MCV^99MRC` | |
| MCH | `MCH^MCH^99MRC` | |
| MCHC | `MCHC^MCHC^99MRC` | |
| RDW-CV | `RDW-CV^RDW-CV^99MRC` | |
| RDW-SD | `RDW-SD^RDW-SD^99MRC` | |
| PLT | `PLT^PLT^99MRC` | |
| MPV | `MPV^MPV^99MRC` | |
| PDW | `PDW^PDW^99MRC` | |
| PCT | `PCT^PCT^99MRC` | |

**IMPORTANT NOTE on 3-Part Differential Mapping:** The Mindray 3-part differential uses "Mid" (mid-sized cells) which is a combined population of monocytes, eosinophils, and basophils. This does NOT directly map to any single LOINC code. In practice:
- **Gran** (granulocytes) roughly corresponds to neutrophils (LOINC 751-8 / 770-8) but technically includes eosinophils and basophils
- **Mid** is closest to monocytes but includes eos and baso
- The middleware should map these to the best available LOINC code but flag the mapping as approximate

### 2.5 Mindray-Specific HL7 Quirks

1. **UNICODE encoding:** Mindray specifies `UNICODE` in MSH-18 (character set), which may affect parsing if the middleware expects ASCII/UTF-8.

2. **3-part vs 5-part differential naming:** The "Lymph/Mid/Gran" naming convention is specific to 3-part differential analyzers. The middleware must handle these differently from the "NEUT/LYMPH/MONO/EO/BASO" naming of 5-part analyzers like the Sysmex XN-550.

3. **Configurable OBX-3 coding:** Mindray analyzers allow the lab to choose between LOINC codes and proprietary codes. The middleware should support both and use the coding system identifier (third component of OBX-3) to distinguish: `LN` = LOINC, `99MRC` = Mindray proprietary.

4. **Histogram data in OBX:** Mindray may send histogram data as encoded binary in additional OBX segments with data type `ED` (Encapsulated Data). These should be logged but not parsed as numeric results.

5. **Result status:** Mindray uses `F` (Final) in OBX-11 for validated results and `P` (Preliminary) for unvalidated. Only `F` results should be forwarded to Medplum by default.

6. **ASTM alternative:** When using ASTM instead of HL7, Mindray uses the same parameter abbreviations (WBC, RBC, etc.) in the R.3 Universal Test ID field, matching the proprietary code table above.

---

## 3. Complete CBC LOINC Code Reference Table

This is the master mapping table for the middleware. It covers ALL CBC parameters from both analyzers.

### 3.1 Core CBC Parameters

| Parameter | Common Name | Sysmex XN-550 Code | Mindray BC-3510 Code | LOINC Code | LOINC Display Name | Unit | Typical Reference Range (Adult) |
|-----------|------------|-------------------|---------------------|------------|-------------------|------|-------------------------------|
| WBC | White Blood Cells | `^^^WBC` | `WBC` / `6690-2` | **6690-2** | Leukocytes [#/volume] in Blood by Automated count | 10^3/uL | 4.5-11.0 |
| RBC | Red Blood Cells | `^^^RBC` | `RBC` / `789-8` | **789-8** | Erythrocytes [#/volume] in Blood by Automated count | 10^6/uL | M: 4.6-6.2; F: 4.2-5.4 |
| HGB | Hemoglobin | `^^^HGB` | `HGB` / `718-7` | **718-7** | Hemoglobin [Mass/volume] in Blood | g/dL | M: 13.0-18.0; F: 12.0-16.0 |
| HCT | Hematocrit | `^^^HCT` | `HCT` / `4544-3` | **4544-3** | Hematocrit [Volume Fraction] of Blood by Automated count | % | M: 40-54; F: 36-48 |
| MCV | Mean Corpuscular Volume | `^^^MCV` | `MCV` / `787-2` | **787-2** | MCV [Entitic volume] by Automated count | fL | 80-100 |
| MCH | Mean Corpuscular Hemoglobin | `^^^MCH` | `MCH` / `785-6` | **785-6** | MCH [Entitic mass] by Automated count | pg | 27-32 |
| MCHC | Mean Corpuscular HGB Concentration | `^^^MCHC` | `MCHC` / `786-4` | **786-4** | MCHC [Mass/volume] by Automated count | g/dL | 32-36 |
| PLT | Platelet Count | `^^^PLT` | `PLT` / `777-3` | **777-3** | Platelets [#/volume] in Blood by Automated count | 10^3/uL | 150-400 |

### 3.2 Red Cell Indices

| Parameter | Common Name | Sysmex XN-550 Code | Mindray BC-3510 Code | LOINC Code | LOINC Display Name | Unit | Typical Reference Range |
|-----------|------------|-------------------|---------------------|------------|-------------------|------|----------------------|
| RDW-CV | RBC Distribution Width (CV) | `^^^RDW-CV` | `RDW-CV` / `788-0` | **788-0** | Erythrocyte distribution width [Ratio] by Automated count | % | 11.5-15.0 |
| RDW-SD | RBC Distribution Width (SD) | `^^^RDW-SD` | `RDW-SD` / `21000-5` | **21000-5** | Erythrocyte distribution width [Entitic volume] by Automated count | fL | 35.0-46.0 |

### 3.3 Platelet Indices

| Parameter | Common Name | Sysmex XN-550 Code | Mindray BC-3510 Code | LOINC Code | LOINC Display Name | Unit | Typical Reference Range |
|-----------|------------|-------------------|---------------------|------------|-------------------|------|----------------------|
| MPV | Mean Platelet Volume | `^^^MPV` | `MPV` / `32623-1` | **32623-1** | Platelet mean volume [Entitic volume] by Automated count | fL | 8.0-12.0 |
| PDW | Platelet Distribution Width | `^^^PDW` | `PDW` / `32207-3` | **32207-3** | Platelet distribution width [Entitic volume] by Automated count | fL | 9.0-17.0 |
| PCT | Plateletcrit | `^^^PCT` | `PCT` / `51637-7` | **51637-7** | Plateletcrit [Volume Fraction] in Blood | % | 0.15-0.40 |
| P-LCR | Platelet Large Cell Ratio | `^^^P-LCR` | N/A (not reported) | **48386-7** | Platelets Large/Platelets in Blood by Automated count | % | 13.0-43.0 |

### 3.4 Sysmex XN-550 Differential (6-Part)

| Parameter | Common Name | Sysmex XN-550 Code | LOINC Code | LOINC Display Name | Unit | Typical Reference Range |
|-----------|------------|-------------------|------------|-------------------|------|----------------------|
| NEUT% | Neutrophil % | `^^^NEUT%` | **770-8** | Neutrophils/Leukocytes in Blood by Automated count | % | 40-70 |
| NEUT# | Neutrophil # | `^^^NEUT#` | **751-8** | Neutrophils [#/volume] in Blood by Automated count | 10^3/uL | 1.5-8.0 |
| LYMPH% | Lymphocyte % | `^^^LYMPH%` | **736-9** | Lymphocytes/Leukocytes in Blood by Automated count | % | 20-40 |
| LYMPH# | Lymphocyte # | `^^^LYMPH#` | **731-0** | Lymphocytes [#/volume] in Blood by Automated count | 10^3/uL | 1.0-4.0 |
| MONO% | Monocyte % | `^^^MONO%` | **5905-5** | Monocytes/Leukocytes in Blood by Automated count | % | 2-8 |
| MONO# | Monocyte # | `^^^MONO#` | **742-7** | Monocytes [#/volume] in Blood by Automated count | 10^3/uL | 0.2-1.0 |
| EO% | Eosinophil % | `^^^EO%` | **713-8** | Eosinophils/Leukocytes in Blood by Automated count | % | 0-4 |
| EO# | Eosinophil # | `^^^EO#` | **711-2** | Eosinophils [#/volume] in Blood by Automated count | 10^3/uL | 0.0-0.5 |
| BASO% | Basophil % | `^^^BASO%` | **706-2** | Basophils/Leukocytes in Blood by Automated count | % | 0-1 |
| BASO# | Basophil # | `^^^BASO#` | **704-7** | Basophils [#/volume] in Blood by Automated count | 10^3/uL | 0.0-0.2 |
| IG% | Immature Granulocyte % | `^^^IG%` | **71695-1** | Immature granulocytes/Leukocytes in Blood by Automated count | % | 0-0.5 |
| IG# | Immature Granulocyte # | `^^^IG#` | **53115-2** | Immature granulocytes [#/volume] in Blood by Automated count | 10^3/uL | 0.0-0.1 |
| NRBC% | Nucleated RBC % | `^^^NRBC%` | **58413-6** | Nucleated erythrocytes/Leukocytes [Ratio] in Blood by Automated count | % | 0 |
| NRBC# | Nucleated RBC # | `^^^NRBC#` | **771-6** | Nucleated erythrocytes [#/volume] in Blood by Automated count | 10^3/uL | 0.0 |

### 3.5 Mindray BC-3510 Differential (3-Part)

| Parameter | Common Name | Mindray BC-3510 Code | LOINC Code | LOINC Display Name | Unit | Typical Reference Range |
|-----------|------------|---------------------|------------|-------------------|------|----------------------|
| Lymph% | Lymphocyte % | `Lymph%` / `736-9` | **736-9** | Lymphocytes/Leukocytes in Blood by Automated count | % | 20-40 |
| Lymph# | Lymphocyte # | `Lymph#` / `731-0` | **731-0** | Lymphocytes [#/volume] in Blood by Automated count | 10^3/uL | 1.0-4.0 |
| Mid% | Mid-Cell % | `Mid%` / N/A | **5905-5** | Monocytes/Leukocytes in Blood by Automated count (approximate) | % | 3-15 |
| Mid# | Mid-Cell # | `Mid#` / N/A | **742-7** | Monocytes [#/volume] in Blood by Automated count (approximate) | 10^3/uL | 0.2-1.2 |
| Gran% | Granulocyte % | `Gran%` / N/A | **770-8** | Neutrophils/Leukocytes in Blood by Automated count (approximate) | % | 40-70 |
| Gran# | Granulocyte # | `Gran#` / N/A | **751-8** | Neutrophils [#/volume] in Blood by Automated count (approximate) | 10^3/uL | 1.5-8.0 |

**Mapping Note:** The 3-part differential categories (Lymph/Mid/Gran) do not directly correspond to the 5/6-part differential categories (NEUT/LYMPH/MONO/EO/BASO). The mapping above uses the closest equivalent LOINC code. The middleware should include a comment extension or note in the FHIR Observation indicating this is a 3-part differential result. Specifically:
- **Gran** includes neutrophils + eosinophils + basophils (not just neutrophils)
- **Mid** includes monocytes + eosinophils + basophils (varies by manufacturer)

### 3.6 FHIR Panel LOINC Codes

| Panel | LOINC Code | Description |
|-------|------------|-------------|
| CBC Panel (no differential) | **58410-2** | CBC panel - Blood by Automated count |
| CBC with Auto Differential | **57021-8** | CBC W Auto Differential panel - Blood |
| CBC with Ordered Manual Differential | **57782-5** | CBC W Ordered Manual Differential panel - Blood |

For DiagnosticReport.code, use **57021-8** for XN-550 results (auto differential) and **58410-2** for BC-3510 results (since the 3-part differential is not a standard auto differential panel).

---

## 4. Reference Ranges

### 4.1 Standard Adult Reference Ranges

| Parameter | Unit | Male Range | Female Range | Notes |
|-----------|------|-----------|-------------|-------|
| WBC | 10^3/uL | 4.5-11.0 | 4.5-11.0 | Same for both genders |
| RBC | 10^6/uL | 4.6-6.2 | 4.2-5.4 | Gender-specific |
| HGB | g/dL | 13.0-18.0 | 12.0-16.0 | Gender-specific; WHO defines M: 13-18, F: 12-16 |
| HCT | % | 40-54 | 36-48 | Gender-specific |
| MCV | fL | 80-100 | 80-100 | Same for both genders |
| MCH | pg | 27-32 | 27-32 | Same for both genders |
| MCHC | g/dL | 32-36 | 32-36 | Same for both genders |
| PLT | 10^3/uL | 150-400 | 150-400 | Same for both genders |
| RDW-CV | % | 11.5-15.0 | 11.5-15.0 | Same for both genders |
| RDW-SD | fL | 35.0-46.0 | 35.0-46.0 | Same for both genders |
| MPV | fL | 8.0-12.0 | 8.0-12.0 | Same for both genders |
| PDW | fL | 9.0-17.0 | 9.0-17.0 | Same for both genders |
| PCT | % | 0.15-0.40 | 0.15-0.40 | Same for both genders |
| P-LCR | % | 13.0-43.0 | 13.0-43.0 | Same for both genders |
| NEUT% | % | 40-70 | 40-70 | Same for both genders |
| NEUT# | 10^3/uL | 1.5-8.0 | 1.5-8.0 | Same for both genders |
| LYMPH% | % | 20-40 | 20-40 | Same for both genders |
| LYMPH# | 10^3/uL | 1.0-4.0 | 1.0-4.0 | Same for both genders |
| MONO% | % | 2-8 | 2-8 | Same for both genders |
| MONO# | 10^3/uL | 0.2-1.0 | 0.2-1.0 | Same for both genders |
| EO% | % | 0-4 | 0-4 | Same for both genders |
| EO# | 10^3/uL | 0.0-0.5 | 0.0-0.5 | Same for both genders |
| BASO% | % | 0-1 | 0-1 | Same for both genders |
| BASO# | 10^3/uL | 0.0-0.2 | 0.0-0.2 | Same for both genders |
| IG% | % | 0-0.5 | 0-0.5 | Same for both genders |
| IG# | 10^3/uL | 0.0-0.1 | 0.0-0.1 | Same for both genders |
| NRBC% | % | 0 | 0 | Normally absent in peripheral blood |
| NRBC# | 10^3/uL | 0.0 | 0.0 | Any presence may be significant |

**Note:** Reference ranges are laboratory-specific. The values above are widely used general adult ranges. The actual ranges used in MediMind should match the hospital's laboratory-validated reference intervals.

### 4.2 Critical Values (Panic Values)

Critical values require immediate physician notification. These trigger HH/LL flags.

| Parameter | Unit | Critical Low | Critical High | Source |
|-----------|------|-------------|--------------|--------|
| WBC | 10^3/uL | < 2.0 | > 30.0 | General consensus |
| HGB | g/dL | < 7.0 | > 20.0 | General consensus |
| HCT | % | < 20 | > 60 | General consensus |
| PLT | 10^3/uL | < 50 | > 1000 | General consensus; < 10 = bleeding risk |
| NRBC# | 10^3/uL | N/A | > 0.0 (any presence) | Clinical significance |

**Important:** Critical values vary by institution. The values above are commonly used thresholds. The hospital laboratory director should define the exact critical values for MediMind.

---

## 5. Flag Mapping

### 5.1 Analyzer Abnormal Flags

Both Sysmex and Mindray use similar abnormal flag conventions based on the ASTM/HL7 standards:

| Flag | Meaning | Context |
|------|---------|---------|
| N | Normal | Result within reference range |
| H | High | Result above upper reference range limit |
| L | Low | Result below lower reference range limit |
| HH | Critically High | Result above critical (panic) high limit |
| LL | Critically Low | Result below critical (panic) low limit |
| A | Abnormal | Result outside reference range (non-numeric context) |
| AA | Critically Abnormal | Critically abnormal (non-numeric context) |
| (empty) | Not flagged | No flag assigned (often treated as normal) |

### 5.2 Sysmex XN-550 Flag Location

In ASTM R records, the abnormal flag is in **field R.6** (Result Abnormal Flags):
```
R|1|^^^WBC|3.45|10*3/uL|4.5-11.0|L||F||operator|20260305143000|XN-550
```
Field positions: R.1=type, R.2=seq, R.3=testID, R.4=value, R.5=unit, R.6=refRange, R.7=flag, R.8=nature, R.9=status

**Correction on field numbering:** The exact field position of the flag depends on the Sysmex ASTM implementation. In the standard ASTM E1394 R record:
- R.3 = Universal Test ID
- R.4 = Data/Measurement Value
- R.5 = Units
- R.6 = Reference Ranges
- R.7 = Result Abnormal Flags
- R.9 = Result Status

### 5.3 Mindray BC-3510 Flag Location

In HL7 v2.3.1 OBX segments, the abnormal flag is in **OBX-8** (Interpretation Codes):
```
OBX|1|NM|6690-2^WBC^LN||3.45|10*3/uL|4.5-11.0|L|||F
```
OBX field positions: OBX-1=setID, OBX-2=valueType, OBX-3=observationID, OBX-4=subID, OBX-5=value, OBX-6=units, OBX-7=refRange, OBX-8=flag, OBX-9=probability, OBX-10=nature, OBX-11=status

### 5.4 Mapping to FHIR Observation.interpretation

The FHIR R4 `Observation.interpretation` uses the code system:
**`http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation`**

| Analyzer Flag (ASTM/HL7) | FHIR Code | FHIR Display | FHIR Definition |
|---------------------------|-----------|--------------|-----------------|
| N | `N` | Normal | Within reference range |
| H | `H` | High | Above upper limit of reference range |
| L | `L` | Low | Below lower limit of reference range |
| HH | `HH` | Critical high | Above critical limit; immediate action required |
| LL | `LL` | Critical low | Below critical limit; immediate action required |
| A | `A` | Abnormal | Outside reference range |
| AA | `AA` | Critical abnormal | Outside critical reference range |
| (empty/null) | `N` | Normal | Default interpretation when no flag is sent |

**FHIR Observation.interpretation example:**
```json
{
  "interpretation": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
          "code": "H",
          "display": "High"
        }
      ]
    }
  ]
}
```

### 5.5 Sysmex Instrument Alert Flags

In addition to the standard abnormal flags, Sysmex XN-series analyzers generate **instrument alert messages** (also called "suspect flags" or "abnormal messages"). These are sent as Comment (C) records in ASTM and are separate from the result abnormal flags:

| Alert Category | Example Messages | Clinical Meaning |
|---------------|-----------------|-----------------|
| WBC Flags | "WBC Abnormal Scattergram", "Left Shift?", "Blasts?", "Atypical Lympho?" | Morphological WBC abnormality suspected |
| RBC Flags | "RBC Agglutination?", "Dimorphic Population?", "Anisocytosis?" | RBC morphology or interference |
| PLT Flags | "PLT Clumps?", "PLT Abnormal Distribution", "Giant PLT?" | Platelet interference or morphology |

These alerts should be:
1. Logged in the middleware's message log
2. Optionally mapped to FHIR Observation.note or DiagnosticReport.conclusion
3. NOT treated as numeric results

---

## 6. Sample Messages

### 6.1 Sample Sysmex XN-550 ASTM Message (CBC + 6-Part Differential)

```
H|\^&|||XN-550^Sysmex^1234|||||||LIS2-A2|P|1|20260305143000
P|1||||DOE^JOHN||19850315|M
O|1|SPC-2024-001234||^^^CBC\^^^DIFF|R||||||O||||Whole Blood
R|1|^^^WBC|7.45|10*3/uL|4.5-11.0|N||F||LAB1|20260305142930|XN-550
R|2|^^^RBC|4.89|10*6/uL|4.6-6.2|N||F||LAB1|20260305142930|XN-550
R|3|^^^HGB|14.8|g/dL|13.0-18.0|N||F||LAB1|20260305142930|XN-550
R|4|^^^HCT|43.2|%|40-54|N||F||LAB1|20260305142930|XN-550
R|5|^^^MCV|88.3|fL|80-100|N||F||LAB1|20260305142930|XN-550
R|6|^^^MCH|30.3|pg|27-32|N||F||LAB1|20260305142930|XN-550
R|7|^^^MCHC|34.3|g/dL|32-36|N||F||LAB1|20260305142930|XN-550
R|8|^^^PLT|245|10*3/uL|150-400|N||F||LAB1|20260305142930|XN-550
R|9|^^^NEUT%|58.3|%|40-70|N||F||LAB1|20260305142930|XN-550
R|10|^^^NEUT#|4.34|10*3/uL|1.5-8.0|N||F||LAB1|20260305142930|XN-550
R|11|^^^LYMPH%|28.7|%|20-40|N||F||LAB1|20260305142930|XN-550
R|12|^^^LYMPH#|2.14|10*3/uL|1.0-4.0|N||F||LAB1|20260305142930|XN-550
R|13|^^^MONO%|7.2|%|2-8|N||F||LAB1|20260305142930|XN-550
R|14|^^^MONO#|0.54|10*3/uL|0.2-1.0|N||F||LAB1|20260305142930|XN-550
R|15|^^^EO%|3.8|%|0-4|N||F||LAB1|20260305142930|XN-550
R|16|^^^EO#|0.28|10*3/uL|0.0-0.5|N||F||LAB1|20260305142930|XN-550
R|17|^^^BASO%|0.5|%|0-1|N||F||LAB1|20260305142930|XN-550
R|18|^^^BASO#|0.04|10*3/uL|0.0-0.2|N||F||LAB1|20260305142930|XN-550
R|19|^^^IG%|0.3|%|0-0.5|N||F||LAB1|20260305142930|XN-550
R|20|^^^IG#|0.02|10*3/uL|0.0-0.1|N||F||LAB1|20260305142930|XN-550
R|21|^^^NRBC%|0.0|%|0|N||F||LAB1|20260305142930|XN-550
R|22|^^^NRBC#|0.00|10*3/uL|0.0|N||F||LAB1|20260305142930|XN-550
R|23|^^^RDW-SD|41.2|fL|35.0-46.0|N||F||LAB1|20260305142930|XN-550
R|24|^^^RDW-CV|13.1|%|11.5-15.0|N||F||LAB1|20260305142930|XN-550
R|25|^^^PDW|11.8|fL|9.0-17.0|N||F||LAB1|20260305142930|XN-550
R|26|^^^MPV|10.2|fL|8.0-12.0|N||F||LAB1|20260305142930|XN-550
R|27|^^^P-LCR|27.3|%|13.0-43.0|N||F||LAB1|20260305142930|XN-550
R|28|^^^PCT|0.25|%|0.15-0.40|N||F||LAB1|20260305142930|XN-550
L|1|N
```

**Notes on the sample:**
- This is a reconstructed example based on ASTM E1394 format and known Sysmex XN-series behavior
- Actual messages will include low-level framing (STX, ETX, checksums) not shown here
- The specimen ID in O.2 (`SPC-2024-001234`) is the barcode used to link to ServiceRequest
- The O.4 field contains the ordered test profile(s)
- Some Sysmex configurations may group results differently or include additional fields

### 6.2 Sample Mindray BC-3510 HL7 ORU^R01 Message (CBC + 3-Part Differential)

```
MSH|^~\&|BC-3510|Mindray|||20260305143000||ORU^R01|MSG00001|P|2.3.1||||||UNICODE
PID|1||PAT-12345||DOE^JOHN||19850315|M
PV1|1|O
OBR|1|SPC-2024-001234||57021-8^CBC^LN|||20260305142500
OBX|1|NM|6690-2^WBC^LN||7.45|10*9/L|4.5-11.0|N|||F
OBX|2|NM|789-8^RBC^LN||4.89|10*12/L|4.6-6.2|N|||F
OBX|3|NM|718-7^HGB^LN||14.8|g/dL|13.0-18.0|N|||F
OBX|4|NM|4544-3^HCT^LN||43.2|%|40-54|N|||F
OBX|5|NM|787-2^MCV^LN||88.3|fL|80-100|N|||F
OBX|6|NM|785-6^MCH^LN||30.3|pg|27-32|N|||F
OBX|7|NM|786-4^MCHC^LN||34.3|g/dL|32-36|N|||F
OBX|8|NM|788-0^RDW-CV^LN||13.1|%|11.5-15.0|N|||F
OBX|9|NM|21000-5^RDW-SD^LN||41.2|fL|35.0-46.0|N|||F
OBX|10|NM|777-3^PLT^LN||245|10*9/L|150-400|N|||F
OBX|11|NM|32623-1^MPV^LN||10.2|fL|8.0-12.0|N|||F
OBX|12|NM|32207-3^PDW^LN||11.8|fL|9.0-17.0|N|||F
OBX|13|NM|51637-7^PCT^LN||0.25|%|0.15-0.40|N|||F
OBX|14|NM|736-9^Lymph%^LN||28.7|%|20-40|N|||F
OBX|15|NM|731-0^Lymph#^LN||2.14|10*9/L|1.0-4.0|N|||F
OBX|16|NM|5905-5^Mid%^LN||11.5|%|3-15|N|||F
OBX|17|NM|742-7^Mid#^LN||0.86|10*9/L|0.2-1.2|N|||F
OBX|18|NM|770-8^Gran%^LN||59.8|%|40-70|N|||F
OBX|19|NM|751-8^Gran#^LN||4.45|10*9/L|1.5-8.0|N|||F
```

**Notes on the sample:**
- This is a reconstructed example based on HL7 v2.3.1 format and known Mindray BC-series behavior
- The message starts with MLLP framing characters (0x0B at start, 0x1C 0x0D at end) not shown
- OBR-3 contains the specimen barcode for linking to ServiceRequest
- Units may vary: Mindray often uses SI units (10*9/L) rather than conventional (10^3/uL)
- The coding system `LN` in OBX-3 indicates LOINC; proprietary mode uses `99MRC`

---

## 7. Implementation Notes

### 7.1 Unit Normalization

The middleware MUST normalize units since Sysmex and Mindray may report in different unit systems:

| Parameter | Sysmex Unit | Mindray Unit | FHIR Preferred (UCUM) | Conversion |
|-----------|------------|-------------|----------------------|------------|
| WBC | 10*3/uL | 10*9/L | 10*3/uL | 1:1 (same value) |
| RBC | 10*6/uL | 10*12/L | 10*6/uL | 1:1 (same value) |
| HGB | g/dL | g/dL | g/dL | None needed |
| PLT | 10*3/uL | 10*9/L | 10*3/uL | 1:1 (same value) |

Note: 10*3/uL and 10*9/L represent the same quantity (both equal 1000 per microliter = 10^9 per liter). No numeric conversion is needed, only unit string normalization for FHIR.

**UCUM unit codes for FHIR Observation.valueQuantity.unit:**

| Unit Display | UCUM Code |
|-------------|-----------|
| 10^3/uL | `10*3/uL` |
| 10^6/uL | `10*6/uL` |
| g/dL | `g/dL` |
| % | `%` |
| fL | `fL` |
| pg | `pg` |

### 7.2 Test Code Matching Strategy

The middleware should implement a two-phase matching strategy:

1. **Phase 1: Direct code match.** If the analyzer sends a LOINC code (e.g., Mindray with LN coding system), use it directly.

2. **Phase 2: Abbreviation-to-LOINC lookup.** If the analyzer sends a proprietary abbreviation (Sysmex test abbreviation or Mindray 99MRC code), look up the LOINC code from the mapping table in Section 3.

The mapping files should be per-analyzer configuration (in `src/mappers/analyzerMappings/`), not hardcoded, so they can be adjusted if the analyzer's test code configuration changes.

### 7.3 Handling 3-Part vs 6-Part Differentials

The middleware must handle both:

- **Sysmex XN-550 (6-part):** Reports NEUT, LYMPH, MONO, EO, BASO, IG separately. Each maps directly to a specific LOINC code.

- **Mindray BC-3510 (3-part):** Reports Lymph, Mid, Gran. These map to approximate LOINC codes. The FHIR Observation should include an extension or note indicating the result is from a 3-part differential:

```json
{
  "extension": [
    {
      "url": "http://medimind.ge/fhir/StructureDefinition/differential-type",
      "valueString": "3-part"
    }
  ]
}
```

### 7.4 Specimen ID Linking

Both analyzers include the specimen barcode in their messages:
- **Sysmex ASTM:** In Order record field O.2 (Specimen ID)
- **Mindray HL7:** In OBR-3 (Filler Order Number) or OBR-2 (Placer Order Number), or PID-3 (Patient Identifier)

The middleware uses this barcode to look up the matching ServiceRequest and Patient in Medplum via `Specimen.identifier`.

---

## 8. Sources

### High Credibility
1. **LOINC.org** (https://loinc.org/) - Official LOINC code database. Codes 57021-8 (CBC panel), 58410-2 (CBC auto), and all individual component codes.
2. **HL7 Terminology** (https://terminology.hl7.org/) - ObservationInterpretation code system for flag mapping.
3. **HL7 FHIR R4** (https://hl7.org/fhir/R4/observation.html) - FHIR Observation resource specification.
4. **NCBI/StatPearls** (https://www.ncbi.nlm.nih.gov/books/NBK604207/) - CBC reference ranges.
5. **FDA 510(k) Reviews** (https://www.accessdata.fda.gov/) - Sysmex XN-series and Mindray BC-series parameter lists from regulatory filings.

### Medium Credibility
6. **Sysmex XN-550 Product Specifications** (https://www.sysmex.com/) - Parameter lists and analyzer capabilities.
7. **Sysmex XN Series ASTM Host Interface Specifications** (R311016 / R315005) - Referenced on Scribd and pdfcoffee.com; original document is manufacturer-confidential.
8. **Mindray BC-3600 Operator's Manual** - Referenced for protocol details applicable to BC-3510 family.
9. **Sysmex Europe Knowledge Centre** (https://www.sysmex-europe.com/academy/) - Parameter definitions (RET-He, IG, NRBC).
10. **Clinical Hematology Reference Ranges** (clinmedjournals.org) - Sysmex XN-3000 reference range table.

### Lower Credibility (used for cross-reference only)
11. **SENAITE ASTM middleware** (https://github.com/senaite/senaite.astm) - Open-source LIS middleware for ASTM protocol reference.
12. **node-astm** (https://github.com/iShafayet/node-astm) - Open-source ASTM parser for Node.js.
13. **BLISInterfaceClient** (https://github.com/stevkky/BLISInterfaceClient) - Open-source LIS interface client supporting Mindray analyzers.

### Limitations and Caveats

1. **Manufacturer documentation is proprietary.** The Sysmex ASTM Host Interface Specification and Mindray HL7 Interface Guide are not freely available online. The test code identifiers in this document are based on the known factory-default abbreviations and should be verified against the actual analyzer configuration at your hospital.

2. **BC-3510 model scarcity.** The Mindray BC-3510 has very limited public documentation. The information here is extrapolated from the well-documented BC-3200 and BC-3600 models in the same product family. Verify during commissioning.

3. **Reference ranges are general.** All reference ranges should be replaced with your hospital laboratory's validated ranges during deployment.

4. **LOINC mappings for 3-part differential are approximate.** There is no perfect LOINC mapping for "Mid-cell" from a 3-part differential. The mappings provided are the best available approximations.

5. **Test code configurability.** Both Sysmex and Mindray allow lab administrators to customize test code abbreviations. The middleware mapping files MUST be configurable to accommodate site-specific customizations.

---

*This document should be reviewed and updated after commissioning when the actual analyzer interface specifications become available.*
