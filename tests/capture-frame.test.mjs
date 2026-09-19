import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureRotationDegrees,
  coverSourceRect,
  frameNeedsQuarterTurn,
  screenOrientationAngle,
} from '../lib/capture-frame.ts';
import { clampZoom, pinchDistance, zoomFromPinch } from '../lib/camera-zoom.ts';

test('coverSourceRect crops the wider side to fill the destination', () => {
  const landscape = coverSourceRect(1600, 900, 390, 844);
  assert.ok(landscape.sw < 1600);
  assert.equal(landscape.sh, 900);
  assert.ok(Math.abs(landscape.sw / landscape.sh - 390 / 844) < 0.01);

  const portrait = coverSourceRect(900, 1600, 844, 390);
  assert.equal(portrait.sw, 900);
  assert.ok(portrait.sh < 1600);
});

test('frameNeedsQuarterTurn detects a landscape buffer in a portrait view', () => {
  assert.equal(frameNeedsQuarterTurn(1600, 900, 390, 844), true);
  assert.equal(frameNeedsQuarterTurn(900, 1600, 390, 844), false);
  assert.equal(frameNeedsQuarterTurn(1600, 900, 844, 390), false);
});

test('captureRotationDegrees maps device angles to an upright still', () => {
  assert.equal(captureRotationDegrees(0), 90);
  assert.equal(captureRotationDegrees(90), 0);
  assert.equal(captureRotationDegrees(180), 270);
  assert.equal(captureRotationDegrees(270), 180);
  assert.equal(screenOrientationAngle({ angle: 90 }, 0), 90);
  assert.equal(screenOrientationAngle(null, -90), 270);
});

test('pinch zoom clamps to the track range and does not invert', () => {
  const range = { min: 1, max: 8 };
  assert.equal(clampZoom(12, 1, 8), 8);
  assert.equal(zoomFromPinch(2, 100, 200, range), 4);
  assert.equal(zoomFromPinch(2, 100, 40, range), 1);
  assert.ok(pinchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 }) === 5);
});
