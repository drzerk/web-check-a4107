# Elektron Analog Rytm MKII — MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an
MCP client (Claude Desktop, Claude Code, etc.) drive an **Elektron Analog Rytm
MKII** over MIDI: trigger pads, tweak synth/sample/filter/amp/LFO parameters,
control transport & clock, switch patterns, and request/inspect SysEx dumps.

It speaks plain MIDI/SysEx, so it works with any USB-MIDI or DIN-MIDI interface
the OS exposes — no Overbridge required.

## Architecture

```
MCP client ──stdio JSON-RPC──> src/index.js
                                   │
                                src/server.js   (tool definitions + dispatch)
                                   │
                                src/rytm.js      (high-level controller)
                       ┌───────────┼───────────────┐
                  src/midi.js   src/tracks.js   src/params.js   src/sysex.js
                  (easymidi)    (12+1 tracks,   (named CC/NRPN  (Elektron 7-bit
                                voice pairs)     map)            packing, dumps)
```

The protocol modules (`sysex`, `tracks`, `params`) are pure and unit-tested.
MIDI is loaded lazily, so tests run without native bindings.

## Device facts baked in

- 12 drum tracks (`BD SD RS CP BT LT MT HT CH OH CY CB`) + 1 FX track, mapped
  onto 8 analog voices. Voice-sharing pairs `RS/CP`, `MT/HT`, `CH/OH`, `CY/CB`
  are encoded in `tracks.js`.
- Elektron SysEx envelope: manufacturer id `00 20 3C`, Analog Rytm product id
  `0x07`, 8-in-7-bit payload packing, 14-bit checksum/length — per the public
  `libanalogrytm` / `rytm-rs` reverse-engineering work.

## Install

```bash
cd elektron-mcp
npm install        # builds the easymidi native module
npm test           # runs the pure-module unit tests
```

## Register with an MCP client

See `examples/mcp-config.json`. For Claude Desktop, merge it into
`claude_desktop_config.json` and use an **absolute** path to `src/index.js`.

```json
{
  "mcpServers": {
    "elektron-rytm": {
      "command": "node",
      "args": ["/abs/path/elektron-mcp/src/index.js"]
    }
  }
}
```

### Track → MIDI channel mapping

Defaults assume "one channel per track" (track 1 → ch 1 … track 12 → ch 12,
FX → ch 13). Override via the `RYTM_TRACK_CHANNELS` env var, either
`BD=1,SD=2,...` or a positional list `1,2,3,...`. Match this to the device's
`SETTINGS → MIDI CONFIG → CHANNELS` page.

## Tools

| Tool | What it does |
|------|--------------|
| `list_ports` | List MIDI inputs/outputs (find your Rytm port). |
| `connect` | Open output (+ optional input for SysEx capture). |
| `status` | Connection / clock / override state. |
| `list_tracks` | The 12+1 tracks with channels and shared voice. |
| `list_parameters` | Named parameters understood by `set_parameter`. |
| `trigger` | Hit a pad (`note` = pitch, `duration_ms` = gate). |
| `set_parameter` | Set a named param (e.g. `filter_frequency`) 0-127. |
| `set_cc` | Raw Control Change on a track channel. |
| `set_nrpn` | Raw NRPN (CC99/98 select, CC6/38 data). |
| `select_pattern` | Bank (A-H) + number (1-16) via bank-select + PC. |
| `program_change` | Raw program change. |
| `transport` | `start` / `stop` / `continue`. |
| `start_clock` / `stop_clock` | Drive MIDI clock at a BPM. |
| `request_dump` | Ask for a `pattern`/`kit`/`sound`/`song`/`settings`/`global` dump. |
| `send_sysex` | Send raw SysEx (byte array or hex string). |
| `get_captured_sysex` | Inspect captured incoming dumps (parsed where possible). |

### Typical session

1. `list_ports` → find the Rytm output name.
2. `connect` with `{ "output": "Analog Rytm", "capture_sysex": true }`.
3. `trigger` `{ "track": "BD", "velocity": 120 }`.
4. `set_parameter` `{ "track": "BD", "parameter": "filter_frequency", "value": 90 }`.
5. `request_dump` `{ "object_type": "pattern", "object_number": 0 }`, then
   `get_captured_sysex` to read the reply.

## Accuracy notes / customising the map

- **Named parameter CCs** live in `data/analog-rytm-params.json`. They follow
  the Analog Rytm MIDI implementation chart, but CC numbers can differ by
  firmware and the `SYN1-8` block is machine-dependent. If a named parameter
  doesn't land where you expect, fix the JSON (or point `RYTM_PARAM_MAP` at your
  own file) — and meanwhile use `set_cc` / `set_nrpn` for exact control.
- **SysEx dump command bytes** in `sysex.js` (`OBJECT_COMMANDS`) use the
  documented request/dump bases `0x62/0x68` and `0x52/0x58`. The per-object
  offsets are best-effort; if a `request_dump` is ignored, capture a real dump
  request from Elektron Transfer and adjust the table. The 7-bit packing and
  checksum helpers are exact and round-trip tested.

## License

MIT
