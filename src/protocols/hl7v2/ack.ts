/**
 * HL7v2 ACK (acknowledgment) message builder.
 *
 * When the middleware receives an HL7v2 message from an analyzer, it must
 * send back an ACK — like a read receipt. The ACK tells the analyzer:
 *   AA = "Got it, everything's fine"
 *   AE = "Got it, but there's an error"
 *   AR = "Rejecting this message"
 *
 * The ACK message includes the original message's control ID so the analyzer
 * knows which message we're acknowledging.
 */

import type { MSHSegment } from './types.js';

/** Counter for generating unique message control IDs */
let ackCounter = 0;

/**
 * Build an HL7v2 ACK response message.
 *
 * @param originalMSH - The MSH segment from the message we're acknowledging
 * @param ackCode - AA (accept), AE (error), or AR (reject)
 * @param errorMessage - Optional error description (included in MSA.3)
 * @returns Complete ACK message string with \r segment separators
 */
export function buildACK(
  originalMSH: MSHSegment,
  ackCode: 'AA' | 'AE' | 'AR',
  errorMessage?: string,
): string {
  const timestamp = formatTimestamp(new Date());
  const controlId = generateControlId();

  // MSH segment — we swap sender/receiver so the reply goes back correctly
  const msh = [
    'MSH',
    originalMSH.encodingCharacters,
    'Middleware',
    'Hospital',
    originalMSH.sendingApplication,
    originalMSH.sendingFacility,
    timestamp,
    '',
    'ACK^R01',
    controlId,
    'P',
    originalMSH.versionId || '2.3.1',
  ].join(originalMSH.fieldSeparator);

  // MSA segment — acknowledgment code + original message ID + optional error
  const msa = [
    'MSA',
    ackCode,
    originalMSH.messageControlId,
    errorMessage ?? '',
  ].join(originalMSH.fieldSeparator);

  return msh + '\r' + msa + '\r';
}

/** Generate a unique message control ID like "ACK-00001" */
function generateControlId(): string {
  ackCounter++;
  return `ACK-${ackCounter.toString().padStart(5, '0')}`;
}

/** Format a Date as HL7v2 timestamp: YYYYMMDDHHmmss */
function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}${h}${min}${s}`;
}
