import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTrack,
  channelForTrack,
  parseChannelOverrides,
  TRACKS,
} from '../src/tracks.js';
import { resolveParam, listParams } from '../src/params.js';

test('resolveTrack accepts index, id and name', () => {
  assert.equal(resolveTrack(1).id, 'BD');
  assert.equal(resolveTrack('SD').id, 'SD');
  assert.equal(resolveTrack('cb').id, 'CB');
  assert.equal(resolveTrack('Closed Hihat').id, 'CH');
  assert.equal(resolveTrack(13).id, 'FX');
});

test('resolveTrack rejects unknown references', () => {
  assert.throws(() => resolveTrack('ZZ'), /Unknown track/);
  assert.throws(() => resolveTrack(99), /No track with index/);
});

test('all 12 voice tracks have distinct default channels 1-12', () => {
  const channels = TRACKS.map((t) => t.defaultChannel);
  assert.deepEqual(channels, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('parseChannelOverrides handles id=channel and positional forms', () => {
  const byId = parseChannelOverrides('BD=10, FX=16');
  assert.equal(byId.BD, 10);
  assert.equal(byId.FX, 16);

  const positional = parseChannelOverrides('5,6,7');
  assert.equal(positional.BD, 5);
  assert.equal(positional.SD, 6);
  assert.equal(positional.RS, 7);
});

test('channelForTrack honors overrides', () => {
  const t = resolveTrack('BD');
  assert.equal(channelForTrack(t, {}), 1);
  assert.equal(channelForTrack(t, { BD: 9 }), 9);
});

test('resolveParam is tolerant of separators and case', () => {
  const a = resolveParam('filter_frequency');
  const b = resolveParam('Filter-Frequency');
  const c = resolveParam('FILTER FREQUENCY');
  assert.ok(a && b && c);
  assert.equal(a.cc, b.cc);
  assert.equal(a.cc, c.cc);
});

test('listParams returns a non-empty sorted set', () => {
  const params = listParams();
  assert.ok(params.length > 10);
  const names = params.map((p) => p.name);
  assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y)));
});
