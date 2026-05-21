/**
 * Audio Analysis Utilities for Smart Studio
 */

export interface Segment {
  start: number;
  end: number;
}

/**
 * Detects silent portions of an audio buffer and returns non-silent segments.
 */
export async function detectSoundSegments(
  audioUrl: string, 
  onProgress?: (p: number) => void,
  thresholdDB: number = -40,
  minSoundDurationSec: number = 0.4,
  minSilenceDurationSec: number = 0.5
): Promise<Segment[]> {
  const context = new AudioContext();
  try {
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer);
  
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const threshold = Math.pow(10, thresholdDB / 20);
  
  const segments: Segment[] = [];
  let isSound = false;
  let segmentStart = 0;
  let silenceStart = 0;

  const chunkSize = Math.floor(sampleRate * 0.05); // 50ms chunks
  const totalSteps = Math.floor(samples.length / chunkSize);
  
  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.slice(i, i + chunkSize);
    const sumSquare = chunk.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(sumSquare / chunk.length);
    
    const time = i / sampleRate;

    if (rms > threshold) {
      if (!isSound) {
        isSound = true;
        segmentStart = time;
      }
      silenceStart = time;
    } else {
      if (isSound && (time - silenceStart) > minSilenceDurationSec) {
        isSound = false;
        if ((silenceStart - segmentStart) > minSoundDurationSec) {
          segments.push({ start: segmentStart, end: silenceStart });
        }
      }
    }
    
    if (onProgress && i % (chunkSize * 10) === 0) {
      onProgress(Math.min(95, Math.floor((i / samples.length) * 100)));
    }
  }

  if (isSound) {
    segments.push({ start: segmentStart, end: audioBuffer.duration });
  }

    if (onProgress) onProgress(100);
    
    // Safety check: ensure no zero-duration segments
    return segments.filter(s => s.end > s.start + 0.1);
  } catch (e) {
    console.error("Silence detection failed", e);
    return [];
  } finally {
    await context.close();
  }
}

/**
 * Finds the timestamp of the first significant peak (clap detection).
 */
export async function findFirstPeak(
  url: string, 
  thresholdDB: number = -6, // High peak
  onProgress?: (p: number) => void
): Promise<number | null> {
  const context = new AudioContext();
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer);
  const samples = audioBuffer.getChannelData(0);
  const threshold = Math.pow(10, thresholdDB / 20);

  const step = 256; // High resolution
  for (let i = 0; i < samples.length; i += step) {
    if (Math.abs(samples[i]) > threshold) {
      if (onProgress) onProgress(100);
      const peakTime = i / audioBuffer.sampleRate;
      await context.close();
      return peakTime;
    }
    
    if (onProgress && i % (step * 500) === 0) {
      onProgress(Math.min(99, Math.floor((i / samples.length) * 100)));
    }
  }

  await context.close();
  return null;
}

/**
 * Parses a VTT file to identify filler words (um, uh, ah).
 */
export async function getFillerWordCuts(vttUrl: string, onProgress?: (p: number) => void): Promise<Segment[]> {
  try {
    if (onProgress) onProgress(0);
    const response = await fetch(vttUrl);
    if (!response.ok) return [];
    const text = await response.text();
    if (onProgress) onProgress(50);
    
    const fillerPatterns = [/\bum\b/i, /\bah\b/i, /\buh\b/i, /\buhm\b/i, /\behm\b/i];
    const cuts: Segment[] = [];
    
    const cueRegex = /(\d{2}:\d{2}:\d{2}.\d{3}) --> (\d{2}:\d{2}:\d{2}.\d{3})\n([\s\S]+?)(?=\n\n|\n$|$)/g;
    let match;

    while ((match = cueRegex.exec(text)) !== null) {
      const startStr = match[1];
      const endStr = match[2];
      const content = match[3];

      if (fillerPatterns.some(p => p.test(content))) {
        cuts.push({
          start: timeToSeconds(startStr),
          end: timeToSeconds(endStr)
        });
      }
    }
    
    return cuts;
  } catch (e) {
    console.error("Filler parsing failed", e);
    return [];
  }
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseFloat(parts[2]);
  return h * 3600 + m * 60 + s;
}
