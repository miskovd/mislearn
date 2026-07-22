<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGeminiLive, type PracticeDirection, type PracticeOptions } from '../hooks/useGeminiLive';
import ApiKeyModal from './ApiKeyModal.vue';
import ProfileModal from './ProfileModal.vue';
import WordsPanel from './WordsPanel.vue';
import { 
  Mic, 
  Volume2, 
  AlertCircle, 
  MessageSquare, 
  Sparkles,
  BookOpen,
  KeyRound,
  Settings2,
  Menu, VolumeX, Maximize2, Minimize2, Send
} from 'lucide-vue-next';
import { getEffectiveGeminiApiKey, getStoredGeminiApiKey } from '../lib/gemini-api-key';
import { getLanguageNativeLabel, getStoredProfileSettings } from '../lib/profile-settings';
import { fetchCurrentUser, signOut, type AuthUser } from '../lib/auth-api';
import { createLocalWord, createRemoteWord, fetchLocalWords, fetchRemoteWords, getLocalWordsCount, syncLocalWordsToRemote, updateLocalWordRating, updateRemoteWordRating } from '../lib/words-api';
import type { WordEntry } from '../lib/words-api';
import { nextPracticeWord, playTrainingFeedback } from '../lib/training';

const { 
  isConnected, 
  isRecording,
  isTutorSpeaking,
  messages, 
  error, 
  startSession, 
  stopSession, stopMic, resumeMic, isAudioMuted, setAudioMuted, sendText
} = useGeminiLive();

const scrollRef = ref<HTMLDivElement | null>(null);
const isWordsPanelOpen = ref(false);
const isApiKeyModalOpen = ref(false);
const isProfileModalOpen = ref(false);
const isMobileMenuOpen = ref(false);
const browserApiKeyPresent = ref(Boolean(getStoredGeminiApiKey()));
const effectiveApiKey = ref(getEffectiveGeminiApiKey());
const nativeLanguage = ref(getStoredProfileSettings().nativeLanguage);
const activePractice = ref<PracticeOptions | null>(null);
const currentUser = ref<AuthUser | null>(null);
const wordSyncStatus = ref<'idle' | 'syncing' | 'synced' | 'error'>('idle');
const chatOpen = ref(false);
const chatExpanded = ref(false);
const typedMessage = ref('');
const selectedTranscriptWord = ref<{ word: string; context: string } | null>(null);
const draftEntry = ref<{ word: string; translation: string; context: string } | null>(null);
const micPausedByChat = ref(false);
const textChatSession = ref(false);

const hasEffectiveApiKey = ref(Boolean(effectiveApiKey.value));
const primaryActionLabel = computed(() => {
  if (!hasEffectiveApiKey.value) {
    return 'Set AI API Key';
  }

  if (isConnected.value) {
    return activePractice.value ? 'Stop' : 'End Session';
  }

  return 'Start Practice';
});

const primaryActionHint = computed(() => {
  if (!hasEffectiveApiKey.value) {
    return 'Add your key to start using Mislearn.';
  }

  if (isConnected.value) {
    return activePractice.value
      ? `Testing "${activePractice.value.word}". Tap Stop to finish.`
      : 'Tap to stop the live session.';
  }

  return 'Tap to start speaking';
});

const handlePrimaryAction = () => {
  if (!hasEffectiveApiKey.value) {
    isApiKeyModalOpen.value = true;
    return;
  }

  if (isConnected.value) {
    handleStop();
    return;
  }

  textChatSession.value = false;
  startSession({
    apiKey: effectiveApiKey.value,
    nativeLanguage: nativeLanguage.value,
    practice: activePractice.value
  });
};

const handleTextChatStart = async () => {
  if (!hasEffectiveApiKey.value) {
    isApiKeyModalOpen.value = true;
    return;
  }

  chatOpen.value = true;
  chatExpanded.value = true;
  if (isConnected.value) stopSession();
  textChatSession.value = true;

  await startSession({
    apiKey: effectiveApiKey.value,
    nativeLanguage: nativeLanguage.value,
    startMicrophone: false
  });
};

function closeTextChat() {
  chatOpen.value = false;
  chatExpanded.value = false;
  selectedTranscriptWord.value = null;
  if (textChatSession.value) {
    stopSession();
    textChatSession.value = false;
    micPausedByChat.value = false;
  }
}

const handleApiKeySaved = () => {
  browserApiKeyPresent.value = Boolean(getStoredGeminiApiKey());
  effectiveApiKey.value = getEffectiveGeminiApiKey();
  hasEffectiveApiKey.value = Boolean(effectiveApiKey.value);
  isApiKeyModalOpen.value = false;
  if (!isConnected.value) {
    error.value = null;
  }
};

const syncLocalWordsForUser = async () => {
  if (!currentUser.value || getLocalWordsCount() === 0) {
    return;
  }

  wordSyncStatus.value = 'syncing';

  try {
    await syncLocalWordsToRemote();
    wordSyncStatus.value = 'synced';
  } catch (error) {
    console.error('Failed to sync local words:', error);
    wordSyncStatus.value = 'error';
  }
};

const handleProfileSaved = () => {
  nativeLanguage.value = getStoredProfileSettings().nativeLanguage;
  isProfileModalOpen.value = false;
};

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false;
};

const handleGoHome = () => {
  isWordsPanelOpen.value = false;
  isApiKeyModalOpen.value = false;
  isProfileModalOpen.value = false;
  isMobileMenuOpen.value = false;
  activePractice.value = null;
  error.value = null;
};

const openProfileModal = () => {
  isMobileMenuOpen.value = false;
  isProfileModalOpen.value = true;
};

const openApiKeyModal = () => {
  isMobileMenuOpen.value = false;
  isApiKeyModalOpen.value = true;
};

const openWordsPanel = () => {
  isMobileMenuOpen.value = false;
  isWordsPanelOpen.value = true;
};

const handlePracticeStart = async (payload: { word: WordEntry; direction: PracticeDirection }) => {
  isWordsPanelOpen.value = false;

  if (isConnected.value) {
    stopSession();
  }

  activePractice.value = {
    word: payload.word.word,
    translation: payload.word.translation,
    context: payload.word.context,
    direction: payload.direction,
    nativeLanguage: nativeLanguage.value
  };
  (activePractice.value as PracticeOptions & { entry?: WordEntry }).entry = payload.word;

  const started = await startSession({
    apiKey: effectiveApiKey.value,
    nativeLanguage: nativeLanguage.value,
    practice: activePractice.value
  });

  if (!started) {
    activePractice.value = null;
  }
};

const handleStop = () => {
  stopSession();
  activePractice.value = null;
  textChatSession.value = false;
};

const handleSignOut = async () => {
  try {
    await signOut();
    currentUser.value = null;
    wordSyncStatus.value = 'idle';
  } catch (error) {
    console.error('Failed to sign out:', error);
  }
};

function prepareEntry(word: string, context = '') {
  const clean = word.replace(/[^A-Za-z'-]/g, '').trim();
  if (clean) draftEntry.value = { word: clean.toLowerCase(), translation: '', context };
  selectedTranscriptWord.value = null;
}

async function saveDraft() {
  if (!draftEntry.value?.word.trim()) return;
  try { await (currentUser.value ? createRemoteWord : createLocalWord)(draftEntry.value); draftEntry.value = null; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not save word.'; }
}

function toggleChatExpanded() {
  chatOpen.value = true; chatExpanded.value = !chatExpanded.value;
  if (chatExpanded.value && isRecording.value) { stopMic(); micPausedByChat.value = true; }
}
function submitText() { if (typedMessage.value.trim()) { sendText(typedMessage.value); typedMessage.value = ''; } }
async function resumeMicrophone() { await resumeMic(); micPausedByChat.value = false; }
async function handleToolCall(event: Event) {
  for (const call of (event as CustomEvent).detail || []) {
    const args = call.args || {};
    if (call.name === 'prepare_dictionary_entry' && typeof args.word === 'string') draftEntry.value = { word: args.word, translation: typeof args.translation === 'string' ? args.translation : '', context: typeof args.context === 'string' ? args.context : '' };
    if (call.name === 'grade_training_answer' && activePractice.value) {
      const entry = (activePractice.value as PracticeOptions & { entry?: WordEntry }).entry;
      if (entry) {
        const rating = Math.max(-3, Math.min(3, entry.learnRating + (args.correct ? 1 : -1)));
        const update = currentUser.value ? updateRemoteWordRating : updateLocalWordRating;
        await update(entry.id, rating);
        playTrainingFeedback(Boolean(args.correct));
        navigator.vibrate?.(args.correct ? 40 : [70, 40, 70]);
        const allWords = await (currentUser.value ? fetchRemoteWords : fetchLocalWords)();
        const next = nextPracticeWord(allWords, entry.id);
        if (next && isConnected.value) {
          stopSession();
          activePractice.value = { word: next.word, translation: next.translation, context: next.context, direction: activePractice.value.direction, nativeLanguage: nativeLanguage.value };
          (activePractice.value as PracticeOptions & { entry?: WordEntry }).entry = next;
          await startSession({ apiKey: effectiveApiKey.value, nativeLanguage: nativeLanguage.value, practice: activePractice.value });
        }
      }
    }
  }
}

onMounted(async () => {
  window.addEventListener('mislearn-tool-call', handleToolCall);
  try {
    currentUser.value = await fetchCurrentUser();
    await syncLocalWordsForUser();
  } catch (error) {
    console.error('Failed to load current user:', error);
  }
});

onUnmounted(() => window.removeEventListener('mislearn-tool-call', handleToolCall));

watch(messages, () => {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
    }
  });
}, { deep: true });
</script>

<template>
  <div class="flex h-[100dvh] flex-col overflow-hidden bg-[#0a0502] font-sans text-white">
    <!-- Immersive Background -->
    <div class="lesson-background fixed inset-0 pointer-events-none overflow-hidden">
      <div class="background-glow background-glow-top" />
      <div class="background-glow background-glow-bottom" />
      <div class="orange-wave orange-wave-top" />
      <div class="orange-wave orange-wave-bottom" />
      <div class="orange-wave orange-wave-front" />
    </div>

    <!-- Header -->
    <header class="lesson-header relative z-[70] flex items-center justify-between border-b border-white/5 px-4 py-4 backdrop-blur-md sm:px-8 sm:py-6">
      <button
        type="button"
        class="flex items-center gap-3 rounded-2xl text-left transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60"
        aria-label="Open home screen"
        @click="handleGoHome"
      >
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 shadow-lg shadow-orange-600/20 sm:h-10 sm:w-10">
          <Sparkles class="h-5 w-5 text-white sm:h-6 sm:w-6" />
        </div>
        <div>
          <h1 class="text-lg font-semibold tracking-tight sm:text-xl">Mislearn</h1>
          <p class="text-[10px] font-medium uppercase tracking-widest text-white/40 sm:text-xs">English Tutor</p>
        </div>
      </button>

      <div class="relative flex items-center gap-3 sm:gap-4">
        <div v-if="isConnected" class="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
        <div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span class="header-live-label text-xs font-medium text-emerald-500">Live Session</span>
        </div>

        <div class="header-mobile-menu relative z-[70]">
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
            :aria-expanded="isMobileMenuOpen"
            aria-label="Open menu"
            @click="isMobileMenuOpen = !isMobileMenuOpen"
          >
            <Menu class="h-5 w-5" />
          </button>

          <Transition name="menu-pop">
            <div v-if="isMobileMenuOpen" class="absolute right-0 top-[calc(100%+0.75rem)] z-[80] w-[min(86vw,280px)] overflow-hidden rounded-[28px] border border-white/10 bg-[#120b08]/95 p-2 shadow-2xl shadow-black/50">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-white/85 transition hover:bg-white/5 hover:text-white"
                @click="openProfileModal"
              >
                <Settings2 class="h-4 w-4 text-orange-300" />
                <span>{{ getLanguageNativeLabel(nativeLanguage) }}</span>
              </button>

              <button type="button" class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-white/85 transition hover:bg-white/5" @click="setAudioMuted(!isAudioMuted)"><VolumeX v-if="isAudioMuted" class="h-4 w-4 text-orange-300" /><Volume2 v-else class="h-4 w-4 text-orange-300" /><span>{{ isAudioMuted ? 'Enable tutor audio' : 'Mute tutor audio' }}</span></button>

              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-white/85 transition hover:bg-white/5 hover:text-white"
                @click="openApiKeyModal"
              >
                <KeyRound class="h-4 w-4 text-orange-300" />
                <span>API Key</span>
              </button>

              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-white/85 transition hover:bg-white/5 hover:text-white"
                @click="openWordsPanel"
              >
                <BookOpen class="h-4 w-4 text-orange-300" />
                <span>My words</span>
              </button>
            </div>
          </Transition>

          <button
            v-if="isMobileMenuOpen"
            type="button"
            class="header-mobile-overlay fixed inset-0 z-[60] cursor-default"
            aria-label="Close menu"
            @click="closeMobileMenu"
          />
        </div>

        <div class="header-desktop-actions relative z-[70] flex items-center gap-4">
          <button type="button" class="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10" :aria-label="isAudioMuted ? 'Enable tutor audio' : 'Mute tutor audio'" @click="setAudioMuted(!isAudioMuted)"><VolumeX v-if="isAudioMuted" class="h-4 w-4" /><Volume2 v-else class="h-4 w-4" /></button>
          <button
            type="button"
            class="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            @click="openProfileModal"
          >
            <Settings2 class="h-4 w-4" />
            <span>{{ getLanguageNativeLabel(nativeLanguage) }}</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            @click="openApiKeyModal"
          >
            <KeyRound class="h-4 w-4" />
            <span>API Key</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            @click="openWordsPanel"
          >
            <BookOpen class="h-4 w-4" />
            <span>My words</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="relative z-10 mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-y-auto overscroll-contain px-6 py-8">
      <div v-if="error" class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400">
        <AlertCircle class="w-5 h-5 flex-shrink-0" />
        <p class="text-sm font-medium">{{ error }}</p>
      </div>

      <div v-if="!error" class="flex-1 flex flex-col items-center justify-center text-center space-y-8">
        <div class="glass-action-pair" aria-label="Choose how to start a lesson">
          <button type="button" class="glass-round-action" @click="handlePrimaryAction" :aria-label="primaryActionLabel">
            <span class="glass-round-icon" :class="isConnected ? 'mic-active' : ''"><KeyRound v-if="!hasEffectiveApiKey" class="h-8 w-8" /><Mic v-else class="h-8 w-8" /></span>
            <span class="glass-round-label"><b>Voice</b><small>{{ primaryActionLabel }}</small></span>
          </button>
          <button type="button" class="glass-round-action" @click="handleTextChatStart" aria-label="Start text chat">
            <span class="glass-round-icon"><MessageSquare class="h-8 w-8" /></span>
            <span class="glass-round-label"><b>Text chat</b><small>Start without a microphone</small></span>
          </button>
        </div>
        <div v-if="activePractice" class="max-w-md space-y-4">
          <div class="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-left text-white/80">
            <p class="text-sm font-semibold">Practice running</p>
            <p class="mt-1 text-sm leading-relaxed text-white/65">
              {{ activePractice.direction === 'english-to-native' ? 'English → ' + getLanguageNativeLabel(nativeLanguage) : getLanguageNativeLabel(nativeLanguage) + ' → English' }}
              using <span class="text-amber-200">{{ activePractice.word }}</span>.
            </p>
          </div>
        </div>

        <div v-else-if="!hasEffectiveApiKey" class="max-w-md space-y-4">
          <div class="rounded-3xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-left text-amber-100">
            <p class="text-sm font-semibold">API key required</p>
            <p class="mt-1 text-sm leading-relaxed text-amber-50/75">
              No browser key is saved. Open the API Key window and save your personal key to continue.
            </p>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#120b08] transition hover:bg-amber-50"
              @click="isApiKeyModalOpen = true"
            >
              <KeyRound class="h-4 w-4" />
              <span>Open API Key Window</span>
            </button>
          </div>
        </div>

        <div v-else-if="!isConnected" class="max-w-md space-y-4">
          <h2 class="text-3xl font-bold tracking-tight">Ready to practice?</h2>
          <p class="text-white/60 leading-relaxed">
            Connect with your AI tutor for real-time English conversation. 
            I'll listen to your speech and provide helpful corrections as we talk.
          </p>
          <div class="grid grid-cols-2 gap-4 pt-4">
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
              <Volume2 class="w-5 h-5 text-orange-400 mb-2" />
              <h3 class="text-sm font-semibold mb-1">Natural Voice</h3>
              <p class="text-xs text-white/40">Realistic real-time audio responses.</p>
            </div>
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
              <MessageSquare class="w-5 h-5 text-amber-400 mb-2" />
              <h3 class="text-sm font-semibold mb-1">Live Corrections</h3>
              <p class="text-xs text-white/40">Instant feedback on grammar and flow.</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isConnected" class="flex-1 flex flex-col overflow-hidden">
        <div 
          ref="scrollRef"
          class="flex-1 overflow-y-auto space-y-6 pr-4 scrollbar-thin scrollbar-thumb-white/10"
        >
          <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-white/20 italic">
            <p>Start speaking to begin your lesson...</p>
          </div>
          
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            :class="[
              'flex flex-col max-w-[85%] transition-all duration-300',
              msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
            ]"
          >
            <div :class="[
              'px-5 py-3 rounded-2xl text-sm leading-relaxed',
              msg.role === 'user' 
                ? 'bg-orange-600 text-white rounded-tr-none' 
                : 'bg-white/10 text-white/90 border border-white/10 rounded-tl-none'
            ]">
              {{ msg.text }}
              <span v-if="msg.isInterrupted" class="ml-2 text-[10px] uppercase font-bold text-white/30 tracking-widest">
                [Interrupted]
              </span>
            </div>
            <span class="mt-1.5 text-[10px] uppercase tracking-widest font-bold text-white/20">
              {{ msg.role === 'user' ? 'You' : 'Mislearn' }}
            </span>
          </div>
        </div>

        <!-- Visualizer / Status -->
        <div class="mt-6 p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="flex gap-1 items-end h-6">
                <div
                  v-for="i in 12"
                  :key="i"
                  class="w-1 bg-orange-500/60 rounded-full animate-bounce"
                  :style="{ 
                    animationDuration: (0.5 + Math.random()) + 's',
                    animationDelay: (i * 0.05) + 's',
                    height: isRecording ? '24px' : '8px'
                  }"
                />
              </div>
              <p class="text-sm font-medium text-white/60">
                {{ isRecording ? "Listening to you..." : "Connecting..." }}
              </p>
            </div>
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/30">
              <div class="w-1.5 h-1.5 rounded-full bg-orange-500" />
              <span>Real-time Audio</span>
            </div>
          </div>
        </div>
      </div>
    </main>

    <section v-if="chatOpen && isConnected" :class="chatExpanded ? 'fixed inset-x-0 bottom-0 top-[89px] z-50 rounded-none' : 'fixed bottom-20 right-6 z-40 h-72 w-[min(92vw,390px)] rounded-3xl'" class="modal-glass flex flex-col border border-orange-100/20 p-4 shadow-2xl">
      <header class="flex items-center justify-between border-b border-white/10 pb-3"><p class="text-sm font-semibold">Transcript</p><div class="flex gap-2"><button type="button" class="rounded-full p-2 hover:bg-white/10" :aria-label="chatExpanded ? 'Compact transcript' : 'Expand transcript'" @click="toggleChatExpanded"><Minimize2 v-if="chatExpanded" class="h-4 w-4" /><Maximize2 v-else class="h-4 w-4" /></button><button type="button" class="rounded-full p-2 hover:bg-white/10" @click="closeTextChat">×</button></div></header>
      <div class="flex-1 overflow-y-auto py-3 text-sm"><p v-for="(msg, index) in messages" :key="index" class="mb-3" :class="msg.role === 'user' ? 'text-orange-200' : 'text-white/75'"><b>{{ msg.role === 'user' ? 'You' : 'Tutor' }}:</b> <template v-for="(token, t) in msg.text.split(/(\s+)/)" :key="t"><button v-if="token.trim()" class="rounded hover:bg-amber-400/20 hover:text-amber-200" @click="selectedTranscriptWord = { word: token, context: msg.text }">{{ token }}</button><span v-else>{{ token }}</span></template></p></div>
      <div v-if="selectedTranscriptWord" class="absolute bottom-14 left-4 rounded-xl border border-white/10 bg-[#24150e] p-2 shadow-xl"><button class="text-sm text-amber-200" @click="prepareEntry(selectedTranscriptWord.word, selectedTranscriptWord.context)">Add to dictionary</button></div>
      <form v-if="chatExpanded" class="flex gap-2 border-t border-white/10 pt-3" @submit.prevent="submitText"><input v-model="typedMessage" class="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none" placeholder="Write a message" /><button class="rounded-xl bg-orange-500 px-3" aria-label="Send"><Send class="h-4 w-4" /></button></form>
    </section>
    <button v-if="isConnected && micPausedByChat && !isRecording" type="button" class="fixed bottom-6 left-6 z-40 rounded-full border border-amber-300/30 bg-[#24150e] px-4 py-3 text-sm text-amber-100 shadow-xl" @click="resumeMicrophone">Resume microphone</button>
    <Teleport to="body">
      <section v-if="activePractice && isConnected" class="training-modal fixed inset-0 z-[90] flex min-h-0 flex-col items-center justify-between text-center" role="dialog" aria-modal="true" aria-label="AI Trainer session">
        <div class="training-modal-glass flex min-h-0 w-full max-w-lg flex-1 flex-col items-center justify-center overflow-y-auto rounded-[2rem] border border-orange-100/20 px-6 py-10">
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100/60">AI Trainer</p>
          <p class="mt-3 text-sm text-white/65">{{ activePractice.direction === 'english-to-native' ? `English → ${getLanguageNativeLabel(nativeLanguage)}` : `${getLanguageNativeLabel(nativeLanguage)} → English` }}</p>
          <div class="training-orb mt-10" :class="isTutorSpeaking ? 'training-orb-tutor' : 'training-orb-learner'" aria-live="polite">
            <span class="training-orb-ring training-orb-ring-one" />
            <span class="training-orb-ring training-orb-ring-two" />
            <Volume2 v-if="isTutorSpeaking" class="relative z-10 h-14 w-14" />
            <Mic v-else class="relative z-10 h-14 w-14" />
          </div>
          <h2 class="mt-9 text-2xl font-semibold tracking-tight">{{ isTutorSpeaking ? 'Listen to your tutor' : 'Your turn' }}</h2>
          <p class="mt-3 max-w-sm text-sm leading-relaxed text-white/65">{{ isTutorSpeaking ? 'Listen to the instruction and sentence. The microphone will turn on when it is time to answer.' : `Say your ${activePractice.direction === 'english-to-native' ? getLanguageNativeLabel(nativeLanguage) : 'English'} translation aloud.` }}</p>
        </div>
        <button type="button" class="training-stop mt-5 w-full max-w-lg shrink-0 rounded-2xl border border-red-200/25 px-5 py-4 text-sm font-semibold text-red-50 transition hover:border-red-200/45 hover:bg-red-500/20" @click="handleStop">Stop training</button>
      </section>
    </Teleport>
    <Teleport to="body"><div v-if="draftEntry" class="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-5 backdrop-blur-md"><form class="modal-glass w-full max-w-md rounded-3xl border border-orange-100/20 p-6" @submit.prevent="saveDraft"><h2 class="text-lg font-semibold">Add to dictionary</h2><p class="mt-1 text-sm text-white/50">Review the card before it is saved.</p><label class="mt-4 block text-sm">Word<input v-model="draftEntry.word" class="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3" /></label><label class="mt-3 block text-sm">Translation<input v-model="draftEntry.translation" class="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3" /></label><label class="mt-3 block text-sm">Context<textarea v-model="draftEntry.context" class="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3" /></label><div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-full px-4 py-2 text-white/70" @click="draftEntry = null">Cancel</button><button class="rounded-full bg-amber-500 px-4 py-2 font-medium">Save</button></div></form></div></Teleport>

    <WordsPanel
      :open="isWordsPanelOpen"
      :native-language="nativeLanguage"
      :user="currentUser"
      :sync-status="wordSyncStatus"
      @close="isWordsPanelOpen = false"
      @practice="handlePracticeStart"
      @sign-out="handleSignOut"
    />

    <ApiKeyModal
      :open="isApiKeyModalOpen"
      :current-key-present="browserApiKeyPresent"
      @close="isApiKeyModalOpen = false"
      @saved="handleApiKeySaved"
    />

    <ProfileModal
      :open="isProfileModalOpen"
      @close="isProfileModalOpen = false"
      @saved="handleProfileSaved"
    />

    <!-- Footer -->
    <footer class="relative z-10 px-8 py-4 text-center">
      <p class="text-[10px] text-white/20 uppercase tracking-[0.2em] font-medium">
        First step - real progress!
      </p>
    </footer>
  </div>
</template>

<style scoped>
.lesson-background {
  background:
    radial-gradient(circle at 13% 0%, rgba(251, 146, 60, 0.24), transparent 30%),
    radial-gradient(circle at 88% 20%, rgba(245, 158, 11, 0.13), transparent 28%),
    linear-gradient(145deg, #160904 0%, #0a0502 54%, #210c04 100%);
}

.lesson-header {
  background: linear-gradient(105deg, rgba(10, 5, 2, 0.82), rgba(24, 10, 4, 0.66));
  border-bottom-color: rgba(255, 237, 213, 0.12);
  box-shadow: 0 10px 30px rgba(7, 3, 1, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(22px) saturate(125%);
  -webkit-backdrop-filter: blur(22px) saturate(125%);
}

.background-glow {
  position: absolute;
  width: 55vw;
  height: 55vw;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.35;
}

.background-glow-top { top: -28vw; right: -14vw; background: #f97316; }
.background-glow-bottom { bottom: -32vw; left: -18vw; background: #d97706; }

.orange-wave {
  position: absolute;
  width: 125%;
  left: -12%;
  border-radius: 48% 52% 0 0 / 14% 18% 0 0;
  transform: rotate(-8deg);
}

.orange-wave-top {
  height: 25vh;
  top: -13vh;
  background: linear-gradient(105deg, rgba(251, 146, 60, 0.74), rgba(251, 191, 36, 0.22));
  box-shadow: inset 0 -25px 45px rgba(255, 237, 213, 0.1);
}

.orange-wave-bottom {
  height: 29vh;
  bottom: -16vh;
  background: linear-gradient(100deg, rgba(234, 88, 12, 0.7), rgba(251, 191, 36, 0.62));
}

.orange-wave-front {
  height: 20vh;
  bottom: -13vh;
  left: -8%;
  transform: rotate(8deg);
  opacity: 0.82;
  background: linear-gradient(100deg, rgba(251, 146, 60, 0.82), rgba(249, 115, 22, 0.5));
}

.glass-action-pair { display: flex; width: min(90vw, 360px); align-items: flex-start; justify-content: space-between; gap: 0; }

.glass-round-action { display: grid; justify-items: center; gap: 0.9rem; color: #fffaf4; transition: transform 180ms ease; }
.glass-round-action:hover { transform: translateY(-5px); }
.glass-round-action:active { transform: translateY(-1px) scale(0.97); }

.glass-round-icon {
  position: relative;
  display: flex;
  width: 126px;
  height: 126px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.46);
  border-radius: 50%;
  color: #fffaf4;
  background: linear-gradient(145deg, rgba(255, 205, 125, 0.85), rgba(248, 132, 20, 0.88) 50%, rgba(190, 60, 4, 0.88));
  box-shadow: 0 14px 24px rgba(52, 13, 2, 0.38), inset 4px 5px 10px rgba(255,255,255,0.38), inset -7px -8px 13px rgba(84,23,2,0.18), 0 1px 0 rgba(255,224,171,0.36);
  backdrop-filter: blur(10px) saturate(155%);
  -webkit-backdrop-filter: blur(10px) saturate(155%);
}

.glass-round-icon::before { position: absolute; top: 10%; left: 17%; width: 56%; height: 21%; border-radius: 50%; content: ''; transform: rotate(-24deg); background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0)); filter: blur(2px); }
.glass-round-icon::after { position: absolute; inset: 6px; border: 1px solid rgba(255,255,255,0.16); border-radius: 50%; content: ''; }
.glass-round-icon svg { position: relative; z-index: 1; filter: drop-shadow(0 2px 2px rgba(82,22,1,0.38)); }

.glass-round-label { display: grid; gap: 0.25rem; text-align: center; }
.glass-round-label b { font-size: 1rem; }
.glass-round-label small { max-width: 145px; font-size: 0.7rem; line-height: 1.35; color: rgba(255,237,213,0.63); }

.modal-glass {
  background: linear-gradient(145deg, rgba(62, 28, 13, 0.78), rgba(22, 10, 5, 0.68));
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 242, 222, 0.2), inset 0 -1px 0 rgba(255, 146, 60, 0.13);
  backdrop-filter: blur(24px) saturate(135%);
  -webkit-backdrop-filter: blur(24px) saturate(135%);
}

.training-modal {
  background: radial-gradient(circle at 50% 18%, rgba(251, 146, 60, 0.2), transparent 35%), rgba(8, 4, 2, 0.8);
  padding: max(1.25rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right)) max(1.25rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left));
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.training-modal-glass {
  background: linear-gradient(145deg, rgba(75, 34, 15, 0.84), rgba(20, 9, 4, 0.78));
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 244, 228, 0.18);
  backdrop-filter: blur(28px) saturate(140%);
  -webkit-backdrop-filter: blur(28px) saturate(140%);
}

.training-orb {
  position: relative;
  display: flex;
  height: min(42vw, 172px);
  width: min(42vw, 172px);
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 50%;
  color: #fffaf5;
}

.training-orb-tutor {
  background: radial-gradient(circle at 35% 26%, rgba(255, 243, 210, 0.75), transparent 22%), linear-gradient(145deg, rgba(251, 161, 62, 0.98), rgba(224, 87, 12, 0.92));
  box-shadow: 0 18px 42px rgba(126, 42, 4, 0.42), inset 0 2px 10px rgba(255, 255, 255, 0.32);
  animation: tutorBreathe 1.2s ease-in-out infinite;
}

.training-orb-learner {
  background: radial-gradient(circle at 35% 26%, rgba(255, 255, 255, 0.54), transparent 22%), linear-gradient(145deg, rgba(112, 66, 42, 0.94), rgba(49, 24, 13, 0.96));
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.4), inset 0 2px 10px rgba(255, 255, 255, 0.18);
  animation: learnerPulse 1.7s ease-in-out infinite;
}

.training-orb-ring {
  position: absolute;
  inset: -14px;
  border: 1px solid rgba(255, 202, 137, 0.38);
  border-radius: 50%;
  opacity: 0;
}

.training-orb-tutor .training-orb-ring { animation: trainerRing 1.35s ease-out infinite; }
.training-orb-tutor .training-orb-ring-two { animation-delay: 0.65s; }
.training-orb-learner .training-orb-ring { border-color: rgba(255, 255, 255, 0.2); animation: trainerRing 1.8s ease-out infinite; }
.training-orb-learner .training-orb-ring-two { animation-delay: 0.9s; }

.training-stop {
  background: linear-gradient(145deg, rgba(122, 34, 22, 0.78), rgba(69, 19, 12, 0.78));
  box-shadow: inset 0 1px 0 rgba(255, 228, 220, 0.16), 0 14px 32px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);
}

@keyframes tutorBreathe { 50% { transform: scale(1.055); filter: brightness(1.08); } }
@keyframes learnerPulse { 50% { transform: scale(1.035); box-shadow: 0 0 0 16px rgba(255, 184, 108, 0.05), 0 18px 42px rgba(0, 0, 0, 0.4); } }
@keyframes trainerRing { 0% { transform: scale(0.82); opacity: 0.66; } 100% { transform: scale(1.18); opacity: 0; } }
.ring-orbit {
  animation: orbit 2.2s linear infinite;
}

.ring-pulse {
  animation: pulseRing 1.4s ease-in-out infinite;
}

.mic-active {
  animation: micGlow 1.8s ease-in-out infinite;
}

.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.header-mobile-menu {
  display: none;
}

.header-live-label {
  display: inline;
}

.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

@media (orientation: portrait) and (max-width: 720px) {
  .header-desktop-actions {
    display: none;
  }

  .header-mobile-menu {
    display: block;
  }

  .header-live-label {
    display: none;
  }

  .glass-action-pair { width: 90%; }
  .glass-round-action { flex: 0 0 45%; }
  .glass-round-icon { width: min(100%, 126px); height: auto; aspect-ratio: 1; }

  .orange-wave-top { top: -9vh; }
  .orange-wave-bottom { bottom: -12vh; }
}

@keyframes orbit {
  0% {
    transform: rotate(0deg);
    border-color: rgba(253, 186, 116, 0.22);
    box-shadow: 0 0 0 0 rgba(251, 146, 60, 0.08);
  }
  50% {
    border-color: rgba(251, 191, 36, 0.6);
    box-shadow: 0 0 0 14px rgba(251, 146, 60, 0);
  }
  100% {
    transform: rotate(360deg);
    border-color: rgba(253, 186, 116, 0.22);
    box-shadow: 0 0 0 0 rgba(251, 146, 60, 0);
  }
}

@keyframes pulseRing {
  0%, 100% {
    transform: scale(1);
    opacity: 0.35;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.7;
  }
}

@keyframes micGlow {
  0%, 100% {
    box-shadow: 0 0 0 rgba(249, 115, 22, 0.25), 0 0 0 0 rgba(251, 146, 60, 0.1);
  }
  50% {
    box-shadow: 0 0 30px rgba(249, 115, 22, 0.4), 0 0 0 18px rgba(251, 146, 60, 0.05);
  }
}
</style>
