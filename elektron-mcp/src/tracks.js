// Analog Rytm track / voice topology.
//
// 12 musical tracks are mapped onto 8 analog voice circuits. The voice-sharing
// pairs (RS/CP, MT/HT, CH/OH, CY/CB) matter for voice stealing and mute logic.
//
// Default MIDI channels assume the common "one channel per track" setup
// (track 1 -> ch 1 ... track 12 -> ch 12, FX -> ch 13). These are configurable
// on the device and can be overridden per-tool or via RYTM_TRACK_CHANNELS.

export const TRACKS = [
  { index: 1, id: 'BD', name: 'Bass Drum', defaultChannel: 1, voice: 0 },
  { index: 2, id: 'SD', name: 'Snare Drum', defaultChannel: 2, voice: 1 },
  { index: 3, id: 'RS', name: 'Rim Shot', defaultChannel: 3, voice: 2 },
  { index: 4, id: 'CP', name: 'Clap', defaultChannel: 4, voice: 2 },
  { index: 5, id: 'BT', name: 'Bass Tom', defaultChannel: 5, voice: 3 },
  { index: 6, id: 'LT', name: 'Low Tom', defaultChannel: 6, voice: 4 },
  { index: 7, id: 'MT', name: 'Mid Tom', defaultChannel: 7, voice: 5 },
  { index: 8, id: 'HT', name: 'High Tom', defaultChannel: 8, voice: 5 },
  { index: 9, id: 'CH', name: 'Closed Hihat', defaultChannel: 9, voice: 6 },
  { index: 10, id: 'OH', name: 'Open Hihat', defaultChannel: 10, voice: 6 },
  { index: 11, id: 'CY', name: 'Cymbal', defaultChannel: 11, voice: 7 },
  { index: 12, id: 'CB', name: 'Cowbell', defaultChannel: 12, voice: 7 },
];

// FX track controls the global Delay/Reverb/Distortion/Compressor blocks.
export const FX_TRACK = { index: 13, id: 'FX', name: 'FX Track', defaultChannel: 13 };

// Pads sharing one analog voice (voice stealing applies within a pair).
export const VOICE_PAIRS = [
  ['RS', 'CP'],
  ['MT', 'HT'],
  ['CH', 'OH'],
  ['CY', 'CB'],
];

const byId = new Map(TRACKS.map((t) => [t.id, t]));
const byIndex = new Map(TRACKS.map((t) => [t.index, t]));
byId.set(FX_TRACK.id, FX_TRACK);
byIndex.set(FX_TRACK.index, FX_TRACK);

/**
 * Resolve a track from a flexible reference: numeric index (1-13), track id
 * ("BD", "fx"), or name. Throws on an unknown reference.
 * @param {string|number} ref
 */
export function resolveTrack(ref) {
  if (ref === undefined || ref === null) throw new Error('Track is required.');
  if (typeof ref === 'number' || /^\d+$/.test(String(ref).trim())) {
    const t = byIndex.get(Number(ref));
    if (!t) throw new Error(`No track with index ${ref} (valid: 1-13).`);
    return t;
  }
  const key = String(ref).trim().toUpperCase();
  const t = byId.get(key);
  if (t) return t;
  const byName = [...byId.values()].find((x) => x.name.toUpperCase() === key);
  if (byName) return byName;
  throw new Error(
    `Unknown track "${ref}". Use 1-13, an id (${TRACKS.map((x) => x.id).join('/')}/FX), or a name.`,
  );
}

/**
 * Per-track channel overrides parsed from RYTM_TRACK_CHANNELS, e.g.
 * "BD=1,SD=2,FX=13" or "1,2,3,...". Returns a map of trackId -> channel(1-16).
 * @param {string|undefined} spec
 */
export function parseChannelOverrides(spec) {
  const overrides = {};
  if (!spec) return overrides;
  const parts = spec.split(',').map((s) => s.trim()).filter(Boolean);
  // bare positional list "1,2,3..." maps onto tracks 1..n
  if (parts.every((p) => /^\d+$/.test(p))) {
    parts.forEach((ch, i) => {
      const t = byIndex.get(i + 1);
      if (t) overrides[t.id] = Number(ch);
    });
    return overrides;
  }
  for (const p of parts) {
    const [id, ch] = p.split('=').map((s) => s.trim());
    if (!id || !ch) continue;
    try {
      overrides[resolveTrack(id).id] = Number(ch);
    } catch {
      /* ignore unknown ids in overrides */
    }
  }
  return overrides;
}

/**
 * The 1-based MIDI channel for a track, honoring overrides.
 * @param {object} track
 * @param {Record<string, number>} overrides
 */
export function channelForTrack(track, overrides = {}) {
  return overrides[track.id] ?? track.defaultChannel;
}
