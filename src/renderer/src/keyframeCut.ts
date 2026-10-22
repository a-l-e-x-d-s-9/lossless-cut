import type { Frame } from './ffmpeg';

// FFmpeg input seeking can return the previous GOP even when the requested PTS
// is a keyframe. Stream-copy output trimming compares DTS, not PTS. Keep source
// timestamps and trim at the keyframe DTS to remove the unwanted earlier GOP.
export default function getAlignedKeyframeCut({ frames, cutFrom, cutTo }: {
  frames: Pick<Frame, 'time' | 'keyframe' | 'decodeTime'>[],
  cutFrom: number,
  cutTo: number,
}) {
  const findKeyframe = (time: number) => frames.find((frame) => frame.keyframe && Math.abs(frame.time - time) < 0.000001);
  const start = cutFrom === 0 ? undefined : findKeyframe(cutFrom);
  if (cutFrom !== 0 && (start?.decodeTime == null || !Number.isFinite(start.decodeTime))) return undefined;

  const end = findKeyframe(cutTo);
  const endDecodeTime = end?.decodeTime;
  if (cutFrom === 0 && (endDecodeTime == null || !Number.isFinite(endDecodeTime))) return undefined;

  const duration = endDecodeTime != null && Number.isFinite(endDecodeTime)
    ? endDecodeTime - (start?.decodeTime ?? 0)
    : cutTo - cutFrom;
  if (duration <= 0) return undefined;
  return { outputSeek: start?.decodeTime, duration };
}

// Keep the input seek and duration consistent with the chosen trimming method.
// An aligned DTS cut already corrects the earlier GOP, so it must not receive
// the additional input seek/offset intended for ordinary keyframe cuts.
export function getKeyframeCutTiming({ cutFrom, cutTo, frameDuration, alignedCut, seekCompensation }: {
  cutFrom: number,
  cutTo: number,
  frameDuration: number,
  alignedCut: ReturnType<typeof getAlignedKeyframeCut>,
  seekCompensation: number,
}) {
  const compensation = alignedCut != null ? 0 : seekCompensation;
  return {
    duration: alignedCut?.duration ?? Math.max(cutTo - cutFrom, frameDuration),
    inputSeek: cutFrom + compensation,
    seekCompensation: compensation,
    outputSeek: alignedCut?.outputSeek,
  };
}
