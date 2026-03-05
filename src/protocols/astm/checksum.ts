/**
 * ASTM E1381 checksum calculator.
 *
 * Every ASTM data frame includes a 2-character hex checksum so the receiver
 * can detect transmission errors (like a typo-checker for serial data).
 *
 * Algorithm: sum all byte values in the frame content (from frame number
 * through ETX/ETB inclusive), take modulo 256, return as 2-character
 * uppercase hex string, zero-padded.
 */

/**
 * Calculate the ASTM checksum for a frame's content.
 *
 * @param frame - The frame content: frame number + record data + CR (optional) + ETX/ETB.
 *                This does NOT include the STX prefix or the checksum/CR/LF suffix.
 * @returns 2-character uppercase hex string (e.g., "9E", "34")
 */
export function calculateChecksum(frame: string): string {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame.charCodeAt(i);
  }
  return (sum % 256).toString(16).toUpperCase().padStart(2, '0');
}
