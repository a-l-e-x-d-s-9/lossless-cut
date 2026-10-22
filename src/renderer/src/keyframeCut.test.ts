import { describe, expect, it } from 'vitest';

import getAlignedKeyframeCut, { getKeyframeCutTiming } from './keyframeCut';

const frames = [
  { time: 0, keyframe: true },
  { time: 4.271, decodeTime: 4.238, keyframe: true },
  { time: 5.339, decodeTime: 5.305, keyframe: true },
  { time: 9.343, decodeTime: 9.309, keyframe: true },
];

const cut = (cutFrom: number, cutTo: number) => getAlignedKeyframeCut({ frames, cutFrom, cutTo });

describe('getAlignedKeyframeCut', () => {
  it('uses DTS to remove the previous GOP without discarding the desired keyframe', () => {
    const result = cut(4.271, 9.343);
    expect(result?.outputSeek).toBe(4.238);
    expect(result?.duration).toBeCloseTo(5.071, 6);
  });

  it('excludes the next keyframe at the end of a very short segment', () => {
    expect(cut(4.271, 5.339)?.duration).toBeCloseTo(1.067, 6);
  });

  it('does not trim away the first keyframe when its DTS is missing', () => {
    expect(cut(0, 4.271)).toEqual({ outputSeek: undefined, duration: 4.238 });
  });

  it('keeps normal keyframe-cut behavior for an unaligned start', () => {
    expect(cut(4, 9.343)).toBeUndefined();
  });

  it('keeps the requested duration when the end is not on a keyframe', () => {
    expect(cut(4.271, 8)?.duration).toBeCloseTo(3.729, 6);
  });

  it('does not change a full-file export without aligned boundaries', () => {
    expect(cut(0, 119.3)).toBeUndefined();
  });

  it('does not treat a non-keyframe as a safe start', () => {
    expect(getAlignedKeyframeCut({ frames: [{ time: 4.271, decodeTime: 4.238, keyframe: false }], cutFrom: 4.271, cutTo: 8 })).toBeUndefined();
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])('rejects an unknown or invalid start DTS %s', (decodeTime) => {
    expect(getAlignedKeyframeCut({ frames: [{ time: 4.271, decodeTime, keyframe: true }], cutFrom: 4.271, cutTo: 8 })).toBeUndefined();
  });

  it('rejects an invalid duration', () => {
    expect(cut(9.343, 4.271)).toBeUndefined();
  });
});

describe('keyframe cut integration with upstream seek compensation', () => {
  const seekCompensation = 3 / 23 + 0.001;
  const frameDuration = 1001 / 30000;

  it('does not apply the upstream input offset to an aligned DTS cut', () => {
    const alignedCut = cut(4.271, 9.343);
    const timing = getKeyframeCutTiming({ cutFrom: 4.271, cutTo: 9.343, frameDuration, alignedCut, seekCompensation });
    expect(timing.inputSeek).toBe(4.271);
    expect(timing.seekCompensation).toBe(0);
    expect(timing.outputSeek).toBe(4.238);
    expect(timing.duration).toBeCloseTo(5.071, 6);
  });

  it('retains upstream compensation for a cut between keyframes', () => {
    const alignedCut = cut(4.5, 9.343);
    const timing = getKeyframeCutTiming({ cutFrom: 4.5, cutTo: 9.343, frameDuration, alignedCut, seekCompensation });
    expect(timing.inputSeek).toBeCloseTo(4.5 + seekCompensation, 6);
    expect(timing.seekCompensation).toBe(seekCompensation);
    expect(timing.outputSeek).toBeUndefined();
    expect(timing.duration).toBeCloseTo(4.843, 6);
  });

  it('retains the upstream minimum duration for adjusted short segments', () => {
    const timing = getKeyframeCutTiming({ cutFrom: 4.5, cutTo: 4.4, frameDuration, alignedCut: undefined, seekCompensation });
    expect(timing.duration).toBe(frameDuration);
  });

  it('keeps the start-of-file keyframe when the first DTS is unavailable', () => {
    const timing = getKeyframeCutTiming({ cutFrom: 0, cutTo: 4.271, frameDuration, alignedCut: cut(0, 4.271), seekCompensation: 0 });
    expect(timing.inputSeek).toBe(0);
    expect(timing.outputSeek).toBeUndefined();
    expect(timing.duration).toBe(4.238);
  });
});
