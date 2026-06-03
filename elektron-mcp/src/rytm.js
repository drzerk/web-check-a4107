// High-level Analog Rytm controller: binds the MIDI layer to track topology,
// the named parameter map and Elektron SysEx framing.

import { RytmMidi, listInputs, listOutputs } from './midi.js';
import { resolveTrack, channelForTrack, parseChannelOverrides, TRACKS, FX_TRACK } from './tracks.js';
import { resolveParam, listParams } from './params.js';
import { buildDumpRequest, parseDump, OBJECT_TYPES } from './sysex.js';

const PATTERN_BANKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export class RytmController {
  constructor() {
    this.midi = new RytmMidi();
    this.channelOverrides = parseChannelOverrides(process.env.RYTM_TRACK_CHANNELS);
    this._capturedSysex = [];
    this._maxCaptured = 64;
  }

  static listPorts() {
    return Promise.all([listOutputs(), listInputs()]).then(([outputs, inputs]) => ({
      outputs,
      inputs,
    }));
  }

  get connected() {
    return this.midi.connected;
  }

  async connect({ output, input, captureSysex } = {}) {
    const result = {};
    result.output = await this.midi.openOutput(output);
    if (input || captureSysex) {
      result.input = await this.midi.openInput(input);
      this.midi.onSysex((bytes) => this._storeSysex(bytes));
    }
    return result;
  }

  _storeSysex(bytes) {
    let parsed = null;
    try {
      parsed = parseDump(bytes);
    } catch {
      /* not an Elektron dump; keep raw */
    }
    this._capturedSysex.push({ at: new Date().toISOString(), bytes: Array.from(bytes), parsed });
    if (this._capturedSysex.length > this._maxCaptured) this._capturedSysex.shift();
  }

  channel(trackRef) {
    return channelForTrack(resolveTrack(trackRef), this.channelOverrides);
  }

  trigger(trackRef, { note = 60, velocity = 100, durationMs = 50 } = {}) {
    const track = resolveTrack(trackRef);
    const ch = channelForTrack(track, this.channelOverrides);
    this.midi.trigger(ch, note, velocity, durationMs);
    return { track: track.id, channel: ch, note, velocity, durationMs };
  }

  setParam(trackRef, paramName, value) {
    const track = resolveTrack(trackRef);
    const ch = channelForTrack(track, this.channelOverrides);
    const def = resolveParam(paramName);
    if (!def) {
      throw new Error(
        `Unknown parameter "${paramName}". Use list_parameters to see names, or set_cc / set_nrpn for raw control.`,
      );
    }
    const v = clamp(value, 0, 127);
    if (def.cc !== undefined) {
      this.midi.cc(ch, def.cc, v);
      return { track: track.id, channel: ch, parameter: def.name, via: `CC${def.cc}`, value: v };
    }
    if (def.nrpnMsb !== undefined && def.nrpnLsb !== undefined) {
      this.midi.nrpn(ch, def.nrpnMsb, def.nrpnLsb, v);
      return {
        track: track.id,
        channel: ch,
        parameter: def.name,
        via: `NRPN ${def.nrpnMsb}/${def.nrpnLsb}`,
        value: v,
      };
    }
    throw new Error(`Parameter "${paramName}" has no CC or NRPN mapping.`);
  }

  setCC(trackRef, controller, value) {
    const ch = this.channel(trackRef);
    this.midi.cc(ch, clamp(controller, 0, 127), clamp(value, 0, 127));
    return { channel: ch, controller, value };
  }

  setNRPN(trackRef, msb, lsb, value, valueLsb) {
    const ch = this.channel(trackRef);
    this.midi.nrpn(ch, msb, lsb, value, valueLsb);
    return { channel: ch, nrpn: `${msb}/${lsb}`, value, valueLsb: valueLsb ?? null };
  }

  selectPattern(bank, number, trackRef = 1) {
    const ch = this.channel(trackRef);
    const bankIndex = typeof bank === 'string' ? PATTERN_BANKS.indexOf(bank.toUpperCase()) : bank;
    if (bankIndex < 0 || bankIndex > 7) {
      throw new Error(`Invalid pattern bank "${bank}". Use A-H or 0-7.`);
    }
    const slot = clamp(number, 1, 16) - 1;
    const program = bankIndex * 16 + slot; // 0-127 across banks A1..H16
    this.midi.bankSelectProgram(ch, 0, 0, program);
    return {
      channel: ch,
      bank: PATTERN_BANKS[bankIndex],
      number: slot + 1,
      programChange: program,
    };
  }

  programChange(trackRef, program) {
    const ch = this.channel(trackRef);
    this.midi.program(ch, clamp(program, 0, 127));
    return { channel: ch, program };
  }

  transport(action) {
    switch (action) {
      case 'start':
        this.midi.start();
        break;
      case 'stop':
        this.midi.stop();
        break;
      case 'continue':
        this.midi.continue();
        break;
      default:
        throw new Error(`Unknown transport action "${action}". Use start/stop/continue.`);
    }
    return { action };
  }

  startClock(bpm) {
    if (bpm < 20 || bpm > 400) throw new Error('BPM out of range (20-400).');
    return this.midi.startClock(bpm);
  }

  stopClock() {
    this.midi.stopClock();
    return { clockRunning: false };
  }

  requestDump(objectType, objectNumber, { legacy = false } = {}) {
    if (!OBJECT_TYPES.includes(objectType)) {
      throw new Error(`Unknown object type "${objectType}". Use one of: ${OBJECT_TYPES.join(', ')}`);
    }
    const msg = buildDumpRequest(objectType, objectNumber, { legacy });
    this.midi.sysex(msg);
    return {
      objectType,
      objectNumber,
      legacy,
      sent: msg.map((b) => b.toString(16).padStart(2, '0')).join(' '),
    };
  }

  sendSysex(bytes) {
    this.midi.sysex(bytes);
    return { bytes: bytes.length };
  }

  getCapturedSysex({ limit = 10 } = {}) {
    return this._capturedSysex.slice(-limit);
  }

  status() {
    return {
      connected: this.connected,
      output: this.midi.outputName,
      input: this.midi.inputName,
      clockRunning: this.midi.clockRunning,
      channelOverrides: this.channelOverrides,
      capturedSysexCount: this._capturedSysex.length,
    };
  }

  describeTracks() {
    return [...TRACKS, FX_TRACK].map((t) => ({
      index: t.index,
      id: t.id,
      name: t.name,
      channel: channelForTrack(t, this.channelOverrides),
      voice: t.voice ?? null,
    }));
  }

  listParameters() {
    return listParams();
  }

  close() {
    this.midi.close();
  }
}

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) throw new Error(`Expected a number, got "${n}".`);
  return Math.max(min, Math.min(max, Math.round(n)));
}
