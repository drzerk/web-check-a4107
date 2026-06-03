// Elektron SysEx framing for the Analog Rytm (MKII).
//
// All constants and the 7-bit packing below follow the publicly documented
// reverse-engineering work in `libanalogrytm` / `rytm-rs`:
//   - Elektron manufacturer id:  00 20 3C
//   - Analog Rytm product id:     0x07
//   - request command bases:      0x62 (legacy) / 0x68 (X, FW >= ~1.70)
//   - dump    command bases:      0x52 (legacy) / 0x58 (X)
//   - payloads use 8-in-7 bit packing followed by a 14-bit checksum + length
//
// The 8<->7 bit packing and checksum helpers are exact and round-trip safe.
// The per-object command bytes are best-effort: cross-check against your OS
// with a real capture if a request is rejected, then tweak `OBJECT_COMMANDS`.

export const ELEKTRON_HEADER = [0x00, 0x20, 0x3c];
export const PRODUCT_ID_ANALOG_RYTM = 0x07;
export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;

// Object command bytes, derived from the documented request/dump bases.
// "x" = the newer "X" container variant (used by recent firmware).
export const OBJECT_COMMANDS = {
  pattern: { request: 0x68, dump: 0x58, requestLegacy: 0x62, dumpLegacy: 0x52 },
  kit: { request: 0x69, dump: 0x59, requestLegacy: 0x63, dumpLegacy: 0x53 },
  sound: { request: 0x6b, dump: 0x5b, requestLegacy: 0x65, dumpLegacy: 0x55 },
  song: { request: 0x6a, dump: 0x5a, requestLegacy: 0x64, dumpLegacy: 0x54 },
  settings: { request: 0x6d, dump: 0x5d, requestLegacy: 0x67, dumpLegacy: 0x57 },
  global: { request: 0x6c, dump: 0x5c, requestLegacy: 0x66, dumpLegacy: 0x56 },
};

export const OBJECT_TYPES = Object.keys(OBJECT_COMMANDS);

/**
 * Pack arbitrary 8-bit bytes into Elektron's 7-bit MIDI-safe representation.
 * Every group of up to 7 source bytes becomes 1 "high bits" byte followed by
 * the same source bytes masked to 7 bits.
 * @param {number[]|Uint8Array} bytes
 * @returns {number[]}
 */
export function encode7bit(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 7) {
    const group = Array.from(bytes).slice(i, i + 7);
    let highBits = 0;
    for (let j = 0; j < group.length; j++) {
      if (group[j] & 0x80) highBits |= 1 << j;
    }
    out.push(highBits & 0x7f);
    for (const b of group) out.push(b & 0x7f);
  }
  return out;
}

/**
 * Reverse of {@link encode7bit}.
 * @param {number[]|Uint8Array} bytes
 * @returns {number[]}
 */
export function decode7bit(bytes) {
  const out = [];
  const src = Array.from(bytes);
  for (let i = 0; i < src.length; i += 8) {
    const highBits = src[i];
    const group = src.slice(i + 1, i + 8);
    for (let j = 0; j < group.length; j++) {
      const high = (highBits >> j) & 1;
      out.push((group[j] & 0x7f) | (high ? 0x80 : 0x00));
    }
  }
  return out;
}

/**
 * Elektron 14-bit checksum, returned as two 7-bit bytes [msb, lsb].
 * @param {number[]} bytes
 * @returns {[number, number]}
 */
export function checksum14(bytes) {
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0x3fff;
  return [(sum >> 7) & 0x7f, sum & 0x7f];
}

/**
 * Encode a 14-bit length as two 7-bit bytes [msb, lsb].
 * @param {number} len
 * @returns {[number, number]}
 */
export function length14(len) {
  return [(len >> 7) & 0x7f, len & 0x7f];
}

/**
 * Build a "request object dump" SysEx message.
 * @param {string} objectType  one of OBJECT_TYPES
 * @param {number} objectNumber 0-127 (use 0x7f for "currently active" on many objects)
 * @param {{legacy?: boolean}} [opts]
 * @returns {number[]} full SysEx message including F0..F7
 */
export function buildDumpRequest(objectType, objectNumber, opts = {}) {
  const cmds = OBJECT_COMMANDS[objectType];
  if (!cmds) {
    throw new Error(
      `Unknown object type "${objectType}". Expected one of: ${OBJECT_TYPES.join(', ')}`,
    );
  }
  const command = opts.legacy ? cmds.requestLegacy : cmds.request;
  const nr = objectNumber & 0x7f;
  return [SYSEX_START, ...ELEKTRON_HEADER, PRODUCT_ID_ANALOG_RYTM, command, nr, SYSEX_END];
}

/**
 * Best-effort parse of a received SysEx dump. Validates the Elektron envelope,
 * identifies the object type from the command byte, and returns the raw decoded
 * 8-bit payload (without the trailing checksum/length housekeeping bytes when
 * they can be identified).
 * @param {number[]|Uint8Array} message full SysEx incl. F0..F7
 */
export function parseDump(message) {
  const m = Array.from(message);
  if (m[0] !== SYSEX_START || m[m.length - 1] !== SYSEX_END) {
    throw new Error('Not a complete SysEx message (missing F0/F7).');
  }
  const header = m.slice(1, 4);
  if (header.join(',') !== ELEKTRON_HEADER.join(',')) {
    throw new Error(
      `Not an Elektron message (header ${header.map((b) => b.toString(16)).join(' ')}).`,
    );
  }
  if (m[4] !== PRODUCT_ID_ANALOG_RYTM) {
    throw new Error(`Not an Analog Rytm message (product id 0x${m[4].toString(16)}).`);
  }
  const command = m[5];
  let objectType = null;
  let isDump = false;
  for (const [type, cmds] of Object.entries(OBJECT_COMMANDS)) {
    if (command === cmds.dump || command === cmds.dumpLegacy) {
      objectType = type;
      isDump = true;
      break;
    }
    if (command === cmds.request || command === cmds.requestLegacy) {
      objectType = type;
      break;
    }
  }
  // Payload sits between the command/obj-number header and the F7 terminator.
  // The exact split of [encoded payload | checksum | length] is firmware
  // dependent; we expose the decoded bytes and let callers diff them.
  const objectNumber = m[6];
  const encodedPayload = m.slice(7, m.length - 1);
  const decoded = decode7bit(encodedPayload);
  return {
    objectType,
    isDump,
    command,
    objectNumber,
    rawLength: m.length,
    encodedPayload,
    decoded,
  };
}

/**
 * Convenience: is this byte array a complete (F0..F7) SysEx message?
 * @param {number[]|Uint8Array} bytes
 */
export function isCompleteSysex(bytes) {
  const b = Array.from(bytes);
  return b.length >= 2 && b[0] === SYSEX_START && b[b.length - 1] === SYSEX_END;
}
