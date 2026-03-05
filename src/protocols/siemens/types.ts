/**
 * Siemens LIS3 protocol types — STUB.
 *
 * The RapidPoint 500e blood gas analyzer uses Siemens' proprietary
 * LIS3 protocol. We don't have the interface specification
 * (document 10844061) from Siemens yet, so these types are
 * placeholders.
 *
 * When we get the spec, we'll fill in the real message structures.
 */

/** Placeholder result type for when we implement Siemens LIS3 */
export interface SiemensLIS3Result {
  specimenId: string;
  parameters: Array<{
    code: string;
    value: string;
    unit: string;
  }>;
  rawMessage: string;
  receivedAt: string;
}
