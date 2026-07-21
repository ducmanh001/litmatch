import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOTS,
  DISCOVERY_BOTS,
  ROOM_JOINERS,
  STAFF,
  canonicalPair,
  profileExtras,
} from './seed-demo-data.fixtures.mjs';

test('canonicalPair luôn trả cặp theo thứ tự ổn định', () => {
  assert.deepEqual(canonicalPair('b', 'a'), ['a', 'b']);
  assert.deepEqual(canonicalPair('a', 'b'), ['a', 'b']);
});

test('profile fixture luôn nằm trong contract discovery', () => {
  const profile = profileExtras(4, 'female');
  assert.equal(profile.region, 'VN');
  assert.equal(profile.seekingGender, 'male');
  assert.equal(profile.interests.length, 3);
  assert.match(profile.birthDate, /^\d{4}-\d{2}-15$/u);
});

test('room joiner và staff chỉ tham chiếu identity fixture hợp lệ', () => {
  const knownUsers = new Set([
    ...BOTS.map(({ key }) => key),
    ...DISCOVERY_BOTS.map(({ key }) => key),
  ]);
  for (const joiners of Object.values(ROOM_JOINERS)) {
    for (const joiner of joiners) assert.equal(knownUsers.has(joiner), true);
  }
  assert.equal(STAFF.filter(({ role }) => role === 'admin').length >= 2, true);
});
