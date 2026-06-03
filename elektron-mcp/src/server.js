// MCP server exposing Elektron Analog Rytm MKII control as tools.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { RytmController } from './rytm.js';
import { OBJECT_TYPES } from './sysex.js';

const controller = new RytmController();

const TOOLS = [
  {
    name: 'list_ports',
    description: 'List available MIDI input and output ports. Use this first to find your Analog Rytm port name.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'connect',
    description:
      'Open a MIDI connection to the Analog Rytm. "output" is a full or partial port name (e.g. "Analog Rytm"). Optionally open an input to capture SysEx dumps.',
    inputSchema: {
      type: 'object',
      properties: {
        output: { type: 'string', description: 'Output port name or substring (defaults to first port).' },
        input: { type: 'string', description: 'Input port name or substring (optional).' },
        capture_sysex: { type: 'boolean', description: 'Open the input and record incoming SysEx dumps.' },
      },
    },
  },
  {
    name: 'status',
    description: 'Show connection state, active ports, clock state and channel overrides.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_tracks',
    description: 'List the 12 drum tracks plus FX track with their ids, names, MIDI channels and shared analog voice.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_parameters',
    description: 'List named synth/sample/filter/amp/LFO parameters that set_parameter understands.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'trigger',
    description: 'Trigger a drum pad. note sets pitch (default 60), durationMs controls gate length.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { type: ['string', 'number'], description: 'Track index 1-13 or id (BD, SD, RS, CP, BT, LT, MT, HT, CH, OH, CY, CB, FX).' },
        note: { type: 'number', description: 'MIDI note (pitch), 0-127. Default 60.' },
        velocity: { type: 'number', description: 'Velocity 1-127. Default 100.' },
        duration_ms: { type: 'number', description: 'Gate length in ms. Default 50.' },
      },
      required: ['track'],
    },
  },
  {
    name: 'set_parameter',
    description: 'Set a named track parameter (e.g. filter_frequency, smp_tune, amp_reverb_send) to a value 0-127.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { type: ['string', 'number'], description: 'Track index 1-13 or id.' },
        parameter: { type: 'string', description: 'Parameter name (see list_parameters).' },
        value: { type: 'number', description: 'Value 0-127.' },
      },
      required: ['track', 'parameter', 'value'],
    },
  },
  {
    name: 'set_cc',
    description: 'Send a raw MIDI Control Change on a track channel. Use for parameters not in the named map.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { type: ['string', 'number'], description: 'Track index 1-13 or id (selects the MIDI channel).' },
        controller: { type: 'number', description: 'CC number 0-127.' },
        value: { type: 'number', description: 'CC value 0-127.' },
      },
      required: ['track', 'controller', 'value'],
    },
  },
  {
    name: 'set_nrpn',
    description: 'Send a raw NRPN (CC99/98 select, CC6/38 data) on a track channel.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { type: ['string', 'number'], description: 'Track index 1-13 or id.' },
        msb: { type: 'number', description: 'NRPN parameter MSB (CC99).' },
        lsb: { type: 'number', description: 'NRPN parameter LSB (CC98).' },
        value: { type: 'number', description: 'Data entry MSB (CC6).' },
        value_lsb: { type: 'number', description: 'Optional data entry LSB (CC38).' },
      },
      required: ['track', 'msb', 'lsb', 'value'],
    },
  },
  {
    name: 'select_pattern',
    description: 'Select a pattern by bank (A-H) and number (1-16) using bank-select + program change.',
    inputSchema: {
      type: 'object',
      properties: {
        bank: { type: ['string', 'number'], description: 'Pattern bank A-H (or 0-7).' },
        number: { type: 'number', description: 'Pattern number 1-16.' },
      },
      required: ['bank', 'number'],
    },
  },
  {
    name: 'program_change',
    description: 'Send a raw program change (0-127) on a track channel.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { type: ['string', 'number'], description: 'Track index 1-13 or id.' },
        program: { type: 'number', description: 'Program number 0-127.' },
      },
      required: ['program'],
    },
  },
  {
    name: 'transport',
    description: 'Send MIDI transport: start, stop or continue.',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['start', 'stop', 'continue'] } },
      required: ['action'],
    },
  },
  {
    name: 'start_clock',
    description: 'Start sending MIDI clock at the given BPM (also sends Start). Useful to drive the Rytm as a slave.',
    inputSchema: {
      type: 'object',
      properties: { bpm: { type: 'number', description: 'Tempo in BPM (20-400).' } },
      required: ['bpm'],
    },
  },
  {
    name: 'stop_clock',
    description: 'Stop the internal MIDI clock.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'request_dump',
    description: `Request a SysEx object dump from the device. object_type one of: ${OBJECT_TYPES.join(', ')}. Connect with capture_sysex enabled to receive the reply.`,
    inputSchema: {
      type: 'object',
      properties: {
        object_type: { type: 'string', enum: OBJECT_TYPES },
        object_number: { type: 'number', description: 'Object slot number (0-127). 127 often means "current".' },
        legacy: { type: 'boolean', description: 'Use legacy (pre-X) command bytes for old firmware.' },
      },
      required: ['object_type', 'object_number'],
    },
  },
  {
    name: 'send_sysex',
    description: 'Send a raw SysEx message. Provide bytes as an array of numbers or a hex string like "F0 00 20 3C 07 ... F7".',
    inputSchema: {
      type: 'object',
      properties: {
        bytes: {
          description: 'Array of byte values, or a whitespace/comma separated hex string.',
          oneOf: [{ type: 'array', items: { type: 'number' } }, { type: 'string' }],
        },
      },
      required: ['bytes'],
    },
  },
  {
    name: 'get_captured_sysex',
    description: 'Return recently captured incoming SysEx messages (requires capture_sysex on connect), parsed where possible.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'How many recent messages to return (default 10).' } },
    },
  },
];

function text(obj) {
  return {
    content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
  };
}

function parseBytes(input) {
  if (Array.isArray(input)) return input.map((n) => Number(n) & 0xff);
  if (typeof input === 'string') {
    return input
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((h) => parseInt(h.replace(/^0x/i, ''), 16) & 0xff);
  }
  throw new Error('bytes must be an array of numbers or a hex string.');
}

async function dispatch(name, args = {}) {
  switch (name) {
    case 'list_ports':
      return text(await RytmController.listPorts());
    case 'connect':
      return text(
        await controller.connect({
          output: args.output,
          input: args.input,
          captureSysex: args.capture_sysex,
        }),
      );
    case 'status':
      return text(controller.status());
    case 'list_tracks':
      return text(controller.describeTracks());
    case 'list_parameters':
      return text(controller.listParameters());
    case 'trigger':
      return text(
        controller.trigger(args.track, {
          note: args.note,
          velocity: args.velocity,
          durationMs: args.duration_ms,
        }),
      );
    case 'set_parameter':
      return text(controller.setParam(args.track, args.parameter, args.value));
    case 'set_cc':
      return text(controller.setCC(args.track, args.controller, args.value));
    case 'set_nrpn':
      return text(controller.setNRPN(args.track, args.msb, args.lsb, args.value, args.value_lsb));
    case 'select_pattern':
      return text(controller.selectPattern(args.bank, args.number));
    case 'program_change':
      return text(controller.programChange(args.track ?? 1, args.program));
    case 'transport':
      return text(controller.transport(args.action));
    case 'start_clock':
      return text(controller.startClock(args.bpm));
    case 'stop_clock':
      return text(controller.stopClock());
    case 'request_dump':
      return text(
        controller.requestDump(args.object_type, args.object_number, { legacy: args.legacy }),
      );
    case 'send_sysex':
      return text(controller.sendSysex(parseBytes(args.bytes)));
    case 'get_captured_sysex':
      return text(controller.getCapturedSysex({ limit: args.limit }));
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}

export async function startServer() {
  const server = new Server(
    { name: 'elektron-rytm-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await dispatch(name, args || {});
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error in ${name}: ${err.message}` }],
      };
    }
  });

  const cleanup = () => {
    try {
      controller.close();
    } catch {
      /* ignore */
    }
  };
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[elektron-rytm-mcp] server ready (stdio)\n');
}
