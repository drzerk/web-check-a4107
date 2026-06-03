import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encode7bit,
  decode7bit,
  checksum14,
  length14,
  buildDumpRequest,
  parseDump,
  ELEKTRON_HEADER,
  PRODUCT_ID_ANALOG_RYTM,
  isCompleteSysex,
} from '../src/sysex.js';

test('7-bit encode/decode round-trips arbitrary bytes', () => {
  const samples = [
    [],
    [0x00],
    [0xff],
    [0x80, 0x7f, 0x01, 0xfe],
    Array.from({ length: 50 }, (_, i) => (i * 37 + 13) & 0xff),
    Array.from({ length: 256 }, (_, i) => i & 0xff),
  ];
  for (const s of samples) {
    const encoded = encode7bit(s);
    assert.ok(encoded.every((b) => b <= 0x7f), 'all encoded bytes are 7-bit safe');
    const decoded = decode7bit(encoded);
    assert.deepEqual(decoded.slice(0, s.length), s);
  }
});

test('encode7bit groups 7 source bytes into 8 output bytes', () => {
  const seven = [0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87];
  const enc = encode7bit(seven);
  assert.equal(enc.length, 8);
  // high-bits byte: all 7 have bit7 set -> 0b1111111 = 0x7f
  assert.equal(enc[0], 0x7f);
  assert.deepEqual(enc.slice(1), [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
});

test('checksum14 and length14 produce two 7-bit bytes', () => {
  const [msb, lsb] = checksum14([0x7f, 0x7f, 0x02]);
  assert.ok(msb <= 0x7f && lsb <= 0x7f);
  // 0x7f + 0x7f + 0x02 = 0x100 -> msb=0x02, lsb=0x00
  assert.deepEqual([msb, lsb], [0x02, 0x00]);
  assert.deepEqual(length14(200), [1, 72]);
});

test('buildDumpRequest produces a valid Elektron envelope', () => {
  const msg = buildDumpRequest('pattern', 5);
  assert.ok(isCompleteSysex(msg));
  assert.deepEqual(msg.slice(1, 4), ELEKTRON_HEADER);
  assert.equal(msg[4], PRODUCT_ID_ANALOG_RYTM);
  assert.equal(msg[6], 5); // object number
  assert.equal(msg[msg.length - 1], 0xf7);
});

test('buildDumpRequest rejects unknown object types', () => {
  assert.throws(() => buildDumpRequest('banana', 0), /Unknown object type/);
});

test('parseDump round-trips a request built locally', () => {
  const msg = buildDumpRequest('kit', 3);
  const parsed = parseDump(msg);
  assert.equal(parsed.objectType, 'kit');
  assert.equal(parsed.objectNumber, 3);
  assert.equal(parsed.isDump, false);
});

test('parseDump rejects non-Elektron messages', () => {
  assert.throws(() => parseDump([0xf0, 0x43, 0x00, 0xf7]), /Not an Elektron/);
});
