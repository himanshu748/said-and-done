import { describe, expect, it } from 'vitest';
import { overlap, pickPromise, readSignal } from '../src/core/followup';

describe('readSignal', () => {
  it.each(['Sent! Contract is attached.', 'Done — see the updated deck.', "Here's the signed NDA", 'Just shared the folder with you'])('done: %s', (t) => {
    expect(readSignal(t)).toBe('done');
  });
  it.each(["Not done yet, sorry", "I haven't sent it", "I'll send it once it's signed", 'Almost finished'])('not done: %s', (t) => {
    expect(readSignal(t)).toBeNull();
  });
  it.each(['Running a bit late on this, need more time', "Sorry, won't make Friday"])('slipping: %s', (t) => {
    expect(readSignal(t)).toBe('slipping');
  });
});

describe('pickPromise', () => {
  const open = [
    { id: 'a', action: 'send the revised contract', createdAt: 1 },
    { id: 'b', action: 'book the venue for the offsite', createdAt: 2 },
  ];
  it('matches by words', () => {
    expect(pickPromise(open, 'Venue is booked!')?.id).toBe('b');
    expect(overlap('send the revised contract', 'contract attached')).toBeGreaterThan(0);
  });
  it('falls back to the oldest', () => {
    expect(pickPromise(open, 'Done.')?.id).toBe('a');
    expect(pickPromise([], 'Done.')).toBeNull();
  });
});
