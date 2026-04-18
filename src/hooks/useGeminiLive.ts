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
}

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

function buildPracticeInstruction(practice: PracticeOptions) {
  const targetWord = practice.word.trim();
  const targetTranslation = practice.translation?.trim();
  const targetContext = practice.context?.trim();
  const nativeLanguageInstruction = getLanguageInstruction(practice.nativeLanguage);
  const focusHint = targetTranslation
    ? `Target word: "${targetWord}" (${targetTranslation}).`
    : `Target word: "${targetWord}".`;
  const contextHint = targetContext ? `Context: ${targetContext}.` : '';

  if (practice.direction === 'english-to-native') {
    return `Vocabulary testing mode.
${focusHint}
${contextHint}
1. Give one short English sentence that uses the target word naturally.
2. Ask the user to translate the sentence into the chosen native language.
3. Wait for the user's answer before continuing.
4. If the answer is wrong or incomplete, correct it briefly in the chosen native language, show the correct translation, and ask for the next attempt.
5. If the answer is correct, confirm it briefly in the chosen native language and continue with a new sentence using the same target word.
6. Keep the session focused on the target word and do not drift away from the test.
7. ${nativeLanguageInstruction}`;
  }

  return `Vocabulary testing mode.
${focusHint}
${contextHint}
1. Give one short prompt in the chosen native language.
2. Ask the user to answer in English using the target word naturally.
3. Wait for the user's answer before continuing.
4. If the answer is wrong or awkward, correct it briefly in English first, then explain the correction in the chosen native language.
5. If the answer is correct, confirm it briefly and continue with a new prompt in the chosen native language.
6. Keep the session focused on the target word and do not drift away from the test.
7. ${nativeLanguageInstruction}`;
}

export function useGeminiLive() {
  const isConnected = ref(false);
  const isRecording = ref(false);
  const messages = ref<Message[]>([]);
  const error = ref<string | null>(null);

  const sessionRef = ref<any>(null);
  const audioContextRef = ref<AudioContext | null>(null);
  const processorRef = ref<ScriptProcessorNode | null>(null);
  const audioQueueRef = ref<AudioQueue | null>(null);
  const currentModelTurnRef = ref<string>("");

  const stopSession = () => {
    if (processorRef.value) {
      processorRef.value.disconnect();
      processorRef.value = null;
    }
    if (audioContextRef.value) {
      audioContextRef.value.close();
      audioContextRef.value = null;
    }
    if (sessionRef.value) {
      sessionRef.value.close();
      sessionRef.value = null;
    }
    if (audioQueueRef.value) {
      audioQueueRef.value.stop();
    }
    isConnected.value = false;
    isRecording.value = false;
  };

  const startSession = async ({ apiKey, nativeLanguage = 'fr', practice = null }: StartSessionOptions) => {
    try {
      error.value = null;
      const normalizedApiKey = apiKey.trim();
      if (!normalizedApiKey) {
        error.value = "API key is missing. Open the API key window and save your key.";
        return false;
      }

      const ai = new GoogleGenAI({ apiKey: normalizedApiKey });
      
      audioQueueRef.value = new AudioQueue(24000);

      const baseInstruction = `You are a friendly and professional English tutor.
Your goal is to help the user practice English conversation.
1. Listen to the user's speech.
2. If you notice any grammatical errors, pronunciation issues, or awkward phrasing, gently correct them.
3. Provide the correction first, then continue the conversation naturally.
4. Keep your responses concise and encouraging.
5. ${getLanguageInstruction(nativeLanguage)}`;

      const systemInstruction = practice ? `${baseInstruction}\n\n${buildPracticeInstruction(practice)}` : baseInstruction;

      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            isConnected.value = true;
            startMic();
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioQueueRef.value) {
              audioQueueRef.value.addChunk(base64Audio);
            }

            if (message.serverContent?.interrupted) {
              if (audioQueueRef.value) audioQueueRef.value.stop();
              const last = messages.value[messages.value.length - 1];
              if (last && last.role === 'model') {
                messages.value[messages.value.length - 1] = { ...last, isInterrupted: true };
              }
            }

            const serverContent = message.serverContent as any;
            const userText = serverContent?.userContent?.parts?.[0]?.text;
            if (userText) {
              messages.value.push({ role: 'user', text: userText });
            }

            const modelText = serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
              currentModelTurnRef.value += modelText;
              const last = messages.value[messages.value.length - 1];
              if (last && last.role === 'model' && !last.isInterrupted) {
                messages.value[messages.value.length - 1] = { role: 'model', text: currentModelTurnRef.value };
              } else {
                messages.value.push({ role: 'model', text: modelText });
              }
            }

            if (message.serverContent?.turnComplete) {
              currentModelTurnRef.value = "";
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

      async function startMic() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
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

  onUnmounted(() => {
    stopSession();
  });

  return {
    isConnected,
    isRecording,
    messages,
    error,
    startSession,
    stopSession
  };
}
