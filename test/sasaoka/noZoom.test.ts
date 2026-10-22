import assert from 'node:assert/strict';
import test from 'node:test';
import {isIos, noZoomViewport} from '../../src/sasaoka/noZoom.ts';

test('iPhone・iPad だけ、欄を押したときの拡大を止める（viewport に maximum-scale=1）', () => {
  assert.equal(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 'iPhone', 5), true);
  assert.equal(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 'MacIntel', 5), true); // iPadOS
  assert.equal(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 'MacIntel', 0), false); // Mac
  assert.equal(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile', 'Linux armv8l', 5), false);
  assert.equal(noZoomViewport('width=device-width, initial-scale=1.0'), 'width=device-width, initial-scale=1.0, maximum-scale=1');
  assert.equal(noZoomViewport('width=device-width, maximum-scale=2'), 'width=device-width, maximum-scale=2');
});
