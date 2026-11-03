import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReaderPages, readerPreparationWindow } from './reader-preparation.ts';

test('opening window includes the saved page and eight on either side, clamped to the archive', () => {
  assert.deepEqual(readerPreparationWindow(100, 50), [50, 51, 49, 52, 48, 53, 47, 54, 46, 55, 45, 56, 44, 57, 43, 58, 42]);
  assert.deepEqual(readerPreparationWindow(100, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(readerPreparationWindow(3, 900), [3, 2, 1]);
  assert.deepEqual(readerPreparationWindow(0, 1), []);
});

test('publishes only after the window completes, then reprioritizes jumps without duplicate work', async () => {
  const controller = new AbortController();
  const prepared = [], updates = [];
  let current = 20, isOpen = false, active = 0, maximumActive = 0;
  await prepareReaderPages({ total: 40, initialPage: 20, currentPage: () => current, signal: controller.signal,
    prepare: async number => {
      active++; maximumActive = Math.max(maximumActive, active);
      if (!isOpen) assert.ok(readerPreparationWindow(40, 20).includes(number));
      else assert.equal(active, 1);
      await new Promise(resolve => setTimeout(resolve, 1));
      prepared.push(number); active--;
      if (number === 40) current = 1;
    },
    opened: () => {
      assert.equal(active, 0);
      assert.deepEqual([...prepared].sort((a, b) => a - b), readerPreparationWindow(40, 20).sort((a, b) => a - b));
      isOpen = true; current = 40;
    },
    progress: (count, openingTotal, background) => updates.push({ count, openingTotal, background }),
  });
  assert.equal(maximumActive, 3);
  assert.equal(prepared[17], 40);
  assert.equal(prepared[18], 1);
  assert.equal(new Set(prepared).size, 40);
  assert.equal(updates[16].background, false);
  assert.equal(updates[17].background, true);
  assert.deepEqual(updates.at(-1), { count: 40, openingTotal: 17, background: true });
});

test('leaving during opening stops queued work and never publishes the reader', async () => {
  const controller = new AbortController();
  const prepared = [];
  let opened = false;
  await assert.rejects(prepareReaderPages({ total: 50, initialPage: 25, currentPage: () => 25, signal: controller.signal,
    prepare: async number => { prepared.push(number); controller.abort(); },
    opened: () => { opened = true; }, progress: () => assert.fail('Cancelled progress must not publish'),
  }), { name: 'AbortError' });
  assert.equal(opened, false);
  assert.deepEqual(prepared, [25]);
});

test('leaving after opening stops background preparation', async () => {
  const controller = new AbortController();
  const prepared = [];
  await assert.rejects(prepareReaderPages({ total: 40, initialPage: 1, currentPage: () => 1, signal: controller.signal,
    prepare: async number => { prepared.push(number); },
    opened: () => controller.abort(), progress: () => {},
  }), { name: 'AbortError' });
  assert.deepEqual(prepared, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
