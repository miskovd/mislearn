import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPracticeInstruction } from '../src/hooks/useGeminiLive.ts';

test('English-to-native trainer opening requires an instruction, first sentence, and then waiting', () => {
  const instruction = buildPracticeInstruction({
    word: 'work', translation: 'travail', context: '', direction: 'english-to-native', nativeLanguage: 'fr'
  });

  assert.match(instruction, /In French, briefly say that the learner must translate/);
  assert.match(instruction, /Immediately say exactly one short, self-contained everyday English sentence/);
  assert.match(instruction, /Every day I go to work\./);
  assert.match(instruction, /He is working on his project\./);
  assert.match(instruction, /Then say nothing else and wait for the learner's answer/);
  assert.match(instruction, /call grade_training_answer before doing anything else/);
});

test('native-to-English trainer opening uses the selected native language and waits after the first prompt', () => {
  const instruction = buildPracticeInstruction({
    word: 'work', translation: 'работать', context: '', direction: 'native-to-english', nativeLanguage: 'ru'
  });

  assert.match(instruction, /In Russian, briefly say that the learner must answer/);
  assert.match(instruction, /Immediately give exactly one short, self-contained everyday Russian sentence/);
  assert.match(instruction, /Then say nothing else and wait for the learner's answer/);
});

test('French-to-English trainer provides a French-only work example and withholds the answer', () => {
  const instruction = buildPracticeInstruction({
    word: 'work', translation: 'travail', context: '', direction: 'native-to-english', nativeLanguage: 'fr'
  });

  assert.match(instruction, /On va travailler demain matin\./);
  assert.match(instruction, /Samedi et dimanche, on ne travaille pas\./);
  assert.match(instruction, /Do not give the English answer/);
});
