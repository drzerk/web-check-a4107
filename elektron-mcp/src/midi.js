// Thin MIDI I/O layer around `easymidi` (which wraps node-midi).
//
// easymidi is loaded lazily so that the pure protocol modules (sysex, params,
// tracks) and their tests can run in environments without native MIDI bindings.
// Only opening a port actually requires the native module.

let easymidi = null;
async function loadEasymidi() {
  if (easymidi) return easymidi;
  try {
    const mod = await import('easymidi');
    easymidi = mod.default || mod;
    return easymidi;
  } catch (err) {
    throw new Error(
      'The "easymidi" module could not be loaded. Install it with `npm install` ' +
        `inside the elektron-mcp directory (native build required). Original error: ${err.message}`,
    );
  }
}

export async function listOutputs() {
  const m = await loadEasymidi();
  return m.getOutputs();
}

export async function listInputs() {
  const m = await loadEasymidi();
  return m.getInputs();
}

/** Find a port by exact name, then case-insensitive substring. */
function matchPort(ports, query) {
  if (!query) return ports[0];
  const exact = ports.find((p) => p === query);
  if (exact) return exact;
  const q = query.toLowerCase();
  return ports.find((p) => p.toLowerCase().includes(q));
}

export class RytmMidi {
  constructor() {
    this.output = null;
    this.input = null;
    this.outputName = null;
    this.inputName = null;
    this._clock = null;
    this._sysexBuffer = [];
    this._sysexListeners = new Set();
  }

  get connected() {
    return Boolean(this.output);
  }

  async openOutput(query) {
    const m = await loadEasymidi();
    const outputs = m.getOutputs();
    if (outputs.length === 0) throw new Error('No MIDI output ports found.');
    const name = matchPort(outputs, query);
    if (!name) throw new Error(`No MIDI output matching "${query}". Available: ${outputs.join(', ')}`);
    if (this.output) this.output.close();
    this.output = new m.Output(name);
    this.outputName = name;
    return name;
  }

  async openInput(query) {
    const m = await loadEasymidi();
    const inputs = m.getInputs();
    if (inputs.length === 0) throw new Error('No MIDI input ports found.');
    const name = matchPort(inputs, query);
    if (!name) throw new Error(`No MIDI input matching "${query}". Available: ${inputs.join(', ')}`);
    if (this.input) this.input.close();
    this.input = new m.Input(name);
    this.inputName = name;
    this.input.on('sysex', (msg) => {
      const bytes = msg.bytes || msg;
      for (const cb of this._sysexListeners) cb(bytes);
    });
    return name;
  }

  onSysex(cb) {
    this._sysexListeners.add(cb);
    return () => this._sysexListeners.delete(cb);
  }

  _requireOutput() {
    if (!this.output) throw new Error('No MIDI output is open. Call connect first.');
    return this.output;
  }

  noteOn(channel, note, velocity = 100) {
    this._requireOutput().send('noteon', { note, velocity, channel: channel - 1 });
  }

  noteOff(channel, note, velocity = 0) {
    this._requireOutput().send('noteoff', { note, velocity, channel: channel - 1 });
  }

  trigger(channel, note, velocity = 100, durationMs = 50) {
    this.noteOn(channel, note, velocity);
    setTimeout(() => {
      try {
        this.noteOff(channel, note, 0);
      } catch {
        /* port may have closed */
      }
    }, Math.max(1, durationMs));
  }

  cc(channel, controller, value) {
    this._requireOutput().send('cc', { controller, value, channel: channel - 1 });
  }

  program(channel, number) {
    this._requireOutput().send('program', { number, channel: channel - 1 });
  }

  pitchBend(channel, value) {
    // easymidi expects 0-16383 (8192 = center)
    this._requireOutput().send('pitch', { value, channel: channel - 1 });
  }

  /** Send an NRPN: CC99/98 select the parameter, CC6/38 carry the value. */
  nrpn(channel, msb, lsb, valueMsb, valueLsb = null) {
    this.cc(channel, 99, msb & 0x7f);
    this.cc(channel, 98, lsb & 0x7f);
    this.cc(channel, 6, valueMsb & 0x7f);
    if (valueLsb !== null && valueLsb !== undefined) this.cc(channel, 38, valueLsb & 0x7f);
  }

  /** Bank-select (CC0 MSB / CC32 LSB) followed by a program change. */
  bankSelectProgram(channel, bankMsb, bankLsb, program) {
    this.cc(channel, 0, bankMsb & 0x7f);
    this.cc(channel, 32, bankLsb & 0x7f);
    this.program(channel, program & 0x7f);
  }

  sysex(bytes) {
    const out = this._requireOutput();
    // easymidi has no typed sysex send; go through the underlying node-midi port.
    const raw = out._output || out.output;
    if (raw && typeof raw.sendMessage === 'function') {
      raw.sendMessage(Array.from(bytes));
    } else if (typeof out.send === 'function') {
      out.send('sysex', Array.from(bytes));
    } else {
      throw new Error('Unable to send SysEx: no raw sendMessage available.');
    }
  }

  start() {
    this._requireOutput().send('start');
  }

  stop() {
    this.stopClock();
    this._requireOutput().send('stop');
  }

  continue() {
    this._requireOutput().send('continue');
  }

  /** Drive MIDI clock (24 PPQN) at the given BPM until stopped. */
  startClock(bpm, { sendStart = true } = {}) {
    this._requireOutput();
    this.stopClock();
    if (sendStart) this.start();
    const intervalMs = 60000 / (bpm * 24);
    this._clock = setInterval(() => {
      try {
        this.output.send('clock');
      } catch {
        this.stopClock();
      }
    }, intervalMs);
    this._clockBpm = bpm;
    return { bpm, intervalMs };
  }

  stopClock() {
    if (this._clock) {
      clearInterval(this._clock);
      this._clock = null;
    }
  }

  get clockRunning() {
    return Boolean(this._clock);
  }

  close() {
    this.stopClock();
    if (this.output) {
      this.output.close();
      this.output = null;
    }
    if (this.input) {
      this.input.close();
      this.input = null;
    }
  }
}
