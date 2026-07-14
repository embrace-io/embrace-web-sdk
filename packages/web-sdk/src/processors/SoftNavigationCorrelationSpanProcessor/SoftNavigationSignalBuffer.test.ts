import * as chai from 'chai';
import { SoftNavigationSignalBuffer } from './SoftNavigationSignalBuffer.ts';

const { expect } = chai;

describe('SoftNavigationSignalBuffer', () => {
  it('collects span and log ids whose start falls within the window', () => {
    const buffer = new SoftNavigationSignalBuffer();
    buffer.record({ kind: 'span', id: 'span-a', startEpochMillis: 1000 });
    buffer.record({ kind: 'log', id: 'log-a', startEpochMillis: 1500 });
    buffer.record({ kind: 'span', id: 'span-b', startEpochMillis: 2000 });

    const result = buffer.collectWindow(1000, 2000);

    expect(result.spanIds).to.deep.equal(['span-a', 'span-b']);
    expect(result.logIds).to.deep.equal(['log-a']);
  });

  it('excludes entries that start outside the window (inclusive bounds)', () => {
    const buffer = new SoftNavigationSignalBuffer();
    buffer.record({ kind: 'span', id: 'before', startEpochMillis: 999 });
    buffer.record({ kind: 'span', id: 'start-edge', startEpochMillis: 1000 });
    buffer.record({ kind: 'span', id: 'end-edge', startEpochMillis: 2000 });
    buffer.record({ kind: 'span', id: 'after', startEpochMillis: 2001 });

    const result = buffer.collectWindow(1000, 2000);

    expect(result.spanIds).to.deep.equal(['start-edge', 'end-edge']);
  });

  it('returns empty arrays when nothing matches', () => {
    const buffer = new SoftNavigationSignalBuffer();
    buffer.record({ kind: 'span', id: 'span-a', startEpochMillis: 100 });

    const result = buffer.collectWindow(1000, 2000);

    expect(result.spanIds).to.deep.equal([]);
    expect(result.logIds).to.deep.equal([]);
  });

  it('evicts entries older than maxAgeMillis relative to the newest entry', () => {
    const buffer = new SoftNavigationSignalBuffer({ maxAgeMillis: 1000 });
    buffer.record({ kind: 'span', id: 'old', startEpochMillis: 1000 });
    // newest is 2500; cutoff = 2500 - 1000 = 1500; 'old' (1000) is evicted
    buffer.record({ kind: 'span', id: 'new', startEpochMillis: 2500 });

    const result = buffer.collectWindow(0, 10000);

    expect(result.spanIds).to.deep.equal(['new']);
  });

  it('evicts the oldest entries when maxEntries is exceeded', () => {
    const buffer = new SoftNavigationSignalBuffer({ maxEntries: 2 });
    buffer.record({ kind: 'span', id: 'a', startEpochMillis: 1 });
    buffer.record({ kind: 'span', id: 'b', startEpochMillis: 2 });
    buffer.record({ kind: 'span', id: 'c', startEpochMillis: 3 });

    const result = buffer.collectWindow(0, 10);

    expect(result.spanIds).to.deep.equal(['b', 'c']);
  });
});
