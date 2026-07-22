import type { WordEntry } from './words-api';

export function nextPracticeWord(words: WordEntry[], currentId: number, random = Math.random) {
  if (words.length === 0) return null;

  const otherWords = words.filter((word) => word.id !== currentId);
  const candidates = otherWords.length > 0 ? otherWords : words;
  const lowestRating = Math.min(...candidates.map((word) => word.learnRating));
  const tied = candidates.filter((word) => word.learnRating === lowestRating);

  return tied[Math.floor(random() * tied.length)] || null;
}

export function playTrainingFeedback(correct: boolean) {
  if (typeof window === 'undefined' || !window.AudioContext) return;

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const duration = correct ? 0.16 : 0.22;

  oscillator.type = correct ? 'sine' : 'triangle';
  oscillator.frequency.setValueAtTime(correct ? 660 : 210, now);
  if (correct) oscillator.frequency.exponentialRampToValueAtTime(880, now + duration);
  else oscillator.frequency.exponentialRampToValueAtTime(150, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
  oscillator.addEventListener('ended', () => void context.close());
}
