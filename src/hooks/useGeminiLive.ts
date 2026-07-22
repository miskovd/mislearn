import { ref, onUnmounted } from 'vue';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { floatTo16BitPCM, AudioQueue } from '../lib/audio-utils';
import type { NativeLanguage } from '../lib/profile-settings';

export interface Message {
  role: 'user' | 'model';
  text: string;
  isInterrupted?: boolean;
}

export type PracticeDirection = 'english-to-native' | 'native-to-english';

export interface PracticeOptions {
  word: string;
  translation?: string;
  context?: string;
  direction: PracticeDirection;
  nativeLanguage: NativeLanguage;
}

export interface StartSessionOptions {
  apiKey: string;
  nativeLanguage?: NativeLanguage;
  practice?: PracticeOptions | null;
  startMicrophone?: boolean;
}

export interface PreparedDictionaryEntry { word: string; translation: string; context: string; }
export interface TrainingGrade { correct: boolean; feedback?: string; }

function getLanguageInstruction(language: NativeLanguage) {
  switch (language) {
    case 'uk':
      return 'Use Ukrainian for explanations, corrections, and translations when the English content is unclear.';
    case 'ru':
      return 'Use Russian for explanations, corrections, and translations when the English content is unclear.';
    case 'fr':
    default:
      return 'Use French for explanations, corrections, and translations when the English content is unclear.';
  }
}

function getNativeLanguageName(language: NativeLanguage) {
  switch (language) {
    case 'uk': return 'Ukrainian';
    case 'ru': return 'Russian';
    case 'fr':
    default: return 'French';
  }
}

export function buildPracticeInstruction(practice: PracticeOptions) {
  const targetWord = practice.word.trim();
  const targetTranslation = practice.translation?.trim();
  const targetContext = practice.context?.trim();
  const nativeLanguageInstruction = getLanguageInstruction(practice.nativeLanguage);
  const focusHint = targetTranslation
    ? `Target word: "${targetWord}" (${targetTranslation}).`
    : `Target word: "${targetWord}".`;
  const contextHint = targetContext ? `Context: ${targetContext}.` : '';
  const nativeLanguageName = getNativeLanguageName(practice.nativeLanguage);

  if (practice.direction === 'english-to-native') {
    return `Vocabulary testing mode.
${focusHint}
${contextHint}
Opening protocol — follow it exactly once, as soon as you receive the start signal:
1. In ${nativeLanguageName}, briefly say that the learner must translate the following English sentences into ${nativeLanguageName}.
2. Immediately say exactly one short, self-contained everyday English sentence that uses the target word or a natural inflection of it. For example, for "work": "Every day I go to work." or "He is working on his project." Do not pause or wait between the instruction and this first sentence.
3. Then say nothing else and wait for the learner's answer.
After every learner answer, call grade_training_answer before doing anything else. The application chooses the next word, so do not ask for another attempt and do not continue with another sentence yourself.
${nativeLanguageInstruction}`;
  }

  return `Vocabulary testing mode.
${focusHint}
${contextHint}
Opening protocol — follow it exactly once, as soon as you receive the start signal:
1. In ${nativeLanguageName}, briefly say that the learner must answer the following prompts in English and use the target word naturally.
2. Immediately give exactly one short, self-contained everyday ${nativeLanguageName} sentence which the learner can translate using the target word or a natural inflection. For example, for "work" in French: "On va travailler demain matin." or "Samedi et dimanche, on ne travaille pas." Do not give the English answer. Do not pause or wait between the instruction and this first prompt.
3. Then say nothing else and wait for the learner's answer.
After every learner answer, call grade_training_answer before doing anything else. The application chooses the next word, so do not ask for another attempt and do not continue with another prompt yourself.
${nativeLanguageInstruction}`;
}

export function useGeminiLive() {
  const isConnected = ref(false);
  const isRecording = ref(false);
  const isTutorSpeaking = ref(false);
  const messages = ref<Message[]>([]);
  const error = ref<string | null>(null);
  const isAudioMuted = ref(localStorage.getItem('mislearn.aiAudioMuted') === 'true');

  const sessionRef = ref<any>(null);
  const audioContextRef = ref<AudioContext | null>(null);
  const processorRef = ref<ScriptProcessorNode | null>(null);
  const audioQueueRef = ref<AudioQueue | null>(null);
  let activeModelMessageIndex: number | null = null;
  let activeUserMessageIndex: number | null = null;
  let lastSentText = '';
  const hiddenRealtimeTexts = new Set<string>();
  let micStream: MediaStream | null = null;
  let startMicRef: (() => Promise<void>) | null = null;

  const stopSession = () => {
    if (processorRef.value) {
      processorRef.value.disconnect();
      processorRef.value = null;
    }
    if (audioContextRef.value) {
      audioContextRef.value.close();
      audioContextRef.value = null;
    }
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    if (sessionRef.value) {
      sessionRef.value.close();
      sessionRef.value = null;
    }
    if (audioQueueRef.value) {
      audioQueueRef.value.stop();
    }
    isConnected.value = false;
    isRecording.value = false;
    isTutorSpeaking.value = false;
  };

  const stopMic = () => {
    processorRef.value?.disconnect(); processorRef.value = null;
    audioContextRef.value?.close(); audioContextRef.value = null;
    micStream?.getTracks().forEach((track) => track.stop()); micStream = null;
    isRecording.value = false;
  };
  const setAudioMuted = (muted: boolean) => {
    isAudioMuted.value = muted; localStorage.setItem('mislearn.aiAudioMuted', String(muted));
    if (muted) audioQueueRef.value?.stop();
  };
  const startSession = async ({ apiKey, nativeLanguage = 'fr', practice = null, startMicrophone = true }: StartSessionOptions) => {
    try {
      error.value = null;
      const normalizedApiKey = apiKey.trim();
      if (!normalizedApiKey) {
        error.value = "API key is missing. Open the API key window and save your key.";
        return false;
      }

      const ai = new GoogleGenAI({ apiKey: normalizedApiKey });
      activeModelMessageIndex = null;
      activeUserMessageIndex = null;
      lastSentText = '';
      hiddenRealtimeTexts.clear();
      isTutorSpeaking.value = false;
      audioQueueRef.value = new AudioQueue(24000);
      let startMicAfterOpeningTutorTurn = Boolean(practice && startMicrophone);
      const handleMicrophoneFailure = (cause: unknown) => {
        console.error('Could not start microphone:', cause);
        error.value = 'Microphone access failed. Use HTTPS on mobile devices, allow the microphone, then try again.';
        stopSession();
      };

      const baseInstruction = `You are a friendly and professional English tutor.
Your goal is to help the user practice English conversation.
1. Listen to the user's speech.
2. If you notice any grammatical errors, pronunciation issues, or awkward phrasing, gently correct them.
3. Provide the correction first, then continue the conversation naturally.
4. Keep your responses concise and encouraging.
5. ${getLanguageInstruction(nativeLanguage)}
6. When the learner asks to add or save an English word to their dictionary, call prepare_dictionary_entry with a normalized word, its native-language translation, and a short context. Never claim that a card was saved: the learner must confirm it in the app.
7. During vocabulary testing, after every learner answer call grade_training_answer with correct=true or false and a short feedback message.`;

      const systemInstruction = practice ? `${baseInstruction}\n\n${buildPracticeInstruction(practice)}` : baseInstruction;

      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [
            { name: 'prepare_dictionary_entry', description: 'Prepare, but never save, a vocabulary card when the user asks to add a word.', parametersJsonSchema: { type: 'object', properties: { word: { type: 'string' }, translation: { type: 'string' }, context: { type: 'string' } }, required: ['word', 'translation'] } },
            { name: 'grade_training_answer', description: 'Grade the learner answer for the current vocabulary exercise.', parametersJsonSchema: { type: 'object', properties: { correct: { type: 'boolean' }, feedback: { type: 'string' } }, required: ['correct'] } }
          ] }],
        },
        callbacks: {
          onopen: () => {
            isConnected.value = true;
            if (startMicrophone && !startMicAfterOpeningTutorTurn) {
              void startMic().catch(handleMicrophoneFailure);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent as any;
            const appendModelFragment = (fragment: string) => {
              if (!fragment) return;
              const active = activeModelMessageIndex === null ? undefined : messages.value[activeModelMessageIndex];
              if (active?.role === 'model' && !active.isInterrupted) {
                messages.value[activeModelMessageIndex!] = { ...active, text: active.text + fragment };
                return;
              }
              messages.value.push({ role: 'model', text: fragment });
              activeModelMessageIndex = messages.value.length - 1;
            };

            for (const part of serverContent?.modelTurn?.parts || []) {
              if (part.inlineData?.data) {
                isTutorSpeaking.value = true;
                if (!isAudioMuted.value) audioQueueRef.value?.addChunk(part.inlineData.data);
              }
              if (part.text) appendModelFragment(part.text);
            }

            if (message.serverContent?.interrupted) {
              if (audioQueueRef.value) audioQueueRef.value.stop();
              const last = messages.value[messages.value.length - 1];
              if (last && last.role === 'model') {
                messages.value[messages.value.length - 1] = { ...last, isInterrupted: true };
              }
              activeModelMessageIndex = null;
              isTutorSpeaking.value = false;
            }

            const userText = serverContent?.inputTranscription?.text || serverContent?.userContent?.parts?.map((part: any) => part.text || '').join('');
            if (userText) {
              const normalizedUserText = userText.trim();
              if (hiddenRealtimeTexts.delete(normalizedUserText)) {
                activeModelMessageIndex = null;
              } else if (normalizedUserText !== lastSentText) {
                const active = activeUserMessageIndex === null ? undefined : messages.value[activeUserMessageIndex];
                if (active?.role === 'user' && !active.isInterrupted) {
                  messages.value[activeUserMessageIndex!] = { ...active, text: active.text + userText };
                } else {
                  messages.value.push({ role: 'user', text: userText });
                  activeUserMessageIndex = messages.value.length - 1;
                }
              }
              lastSentText = '';
              activeModelMessageIndex = null;
              isTutorSpeaking.value = false;
            }

            const outputText = serverContent?.outputTranscription?.text;
            if (outputText && !serverContent?.modelTurn?.parts?.some((part: any) => part.text)) appendModelFragment(outputText);
            const calls = (message as any).toolCall?.functionCalls || (message as any).toolCall?.functionCalls || [];
            if (calls.length) {
              const responses = calls.map((call: any) => ({ id: call.id, name: call.name, response: call.args || {} }));
              session.sendToolResponse({ functionResponses: responses });
              window.dispatchEvent(new CustomEvent('mislearn-tool-call', { detail: calls }));
            }

            if (message.serverContent?.turnComplete) {
              activeUserMessageIndex = null;
              isTutorSpeaking.value = false;
              if (startMicAfterOpeningTutorTurn) {
                startMicAfterOpeningTutorTurn = false;
                void startMic().catch(handleMicrophoneFailure);
              }
            }
          },
          onclose: () => {
            stopSession();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            error.value = "Connection error. Please try again.";
            stopSession();
          }
        }
      });

      sessionRef.value = session;
      startMicRef = startMic;
      if (practice) {
        const startSignal = 'Start the vocabulary exercise now: say the opening instruction and the first task, then wait for my answer.';
        hiddenRealtimeTexts.add(startSignal);
        isTutorSpeaking.value = true;
        session.sendRealtimeInput({ text: startSignal });
      }

      async function startMic() {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        micStream = stream;
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.value = audioContext;
        
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.value = processor;

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = floatTo16BitPCM(inputData);
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData)));
          
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        isRecording.value = true;
      }
    } catch (err) {
      console.error("Failed to start session:", err);
      error.value = "Could not access microphone or connect to AI.";
      stopSession();
      return false;
    }

    return true;
  };

  const resumeMic = async () => {
    if (sessionRef.value && !isRecording.value) {
      await startMicRef?.();
    }
  };

  const sendText = (text: string) => {
    if (!sessionRef.value || !text.trim()) return;
    const submitted = text.trim();
    sessionRef.value.sendRealtimeInput({ text: submitted });
    messages.value.push({ role: 'user', text: submitted });
    lastSentText = submitted;
    activeUserMessageIndex = messages.value.length - 1;
    activeModelMessageIndex = null;
  };

  onUnmounted(() => {
    stopSession();
  });

  return {
    isConnected,
    isRecording,
    isTutorSpeaking,
    messages,
    error,
    isAudioMuted,
    startSession,
    stopSession
    , stopMic, resumeMic, setAudioMuted, sendText
  };
}
