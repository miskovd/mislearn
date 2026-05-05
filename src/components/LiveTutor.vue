<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
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
  Menu
} from 'lucide-vue-next';
import { getEffectiveGeminiApiKey, getStoredGeminiApiKey } from '../lib/gemini-api-key';
import { getLanguageNativeLabel, getStoredProfileSettings } from '../lib/profile-settings';
import { fetchCurrentUser, signOut, type AuthUser } from '../lib/auth-api';
import { getLocalWordsCount, syncLocalWordsToRemote } from '../lib/words-api';
import type { WordEntry } from '../lib/words-api';

const { 
  isConnected, 
  isRecording, 
  messages, 
  error, 
  startSession, 
  stopSession 
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

  startSession({
    apiKey: effectiveApiKey.value,
    nativeLanguage: nativeLanguage.value,
    practice: activePractice.value
  });
};

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

onMounted(async () => {
  try {
    currentUser.value = await fetchCurrentUser();
    await syncLocalWordsForUser();
  } catch (error) {
    console.error('Failed to load current user:', error);
  }
});

watch(messages, () => {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
    }
  });
}, { deep: true });
</script>

<template>
  <div class="flex flex-col h-screen bg-[#0a0502] text-white font-sans overflow-hidden">
    <!-- Immersive Background -->
    <div class="fixed inset-0 pointer-events-none">
      <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/20 blur-[120px] rounded-full" />
      <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-900/10 blur-[120px] rounded-full" />
    </div>

    <!-- Header -->
    <header class="relative z-[70] flex items-center justify-between border-b border-white/5 px-4 py-4 backdrop-blur-md sm:px-8 sm:py-6">
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
    <main class="relative z-10 flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-8 overflow-hidden">
      <div v-if="error" class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400">
        <AlertCircle class="w-5 h-5 flex-shrink-0" />
        <p class="text-sm font-medium">{{ error }}</p>
      </div>

      <div v-if="!error" class="flex-1 flex flex-col items-center justify-center text-center space-y-8">
        <button
          type="button"
          class="group relative"
          @click="handlePrimaryAction"
          :aria-label="primaryActionLabel"
        >
          <div class="absolute inset-0 bg-orange-600/20 blur-3xl rounded-full" />
          <div
            v-if="isConnected"
            class="pointer-events-none absolute inset-[-16px] rounded-full border border-orange-300/35 ring-orbit"
          />
          <div
            v-if="isConnected"
            class="pointer-events-none absolute inset-[-8px] rounded-full border border-orange-400/30 ring-pulse"
          />
          <div
            class="relative w-32 h-32 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-2xl transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
            :class="[
              isConnected ? 'mic-active' : '',
              !hasEffectiveApiKey ? 'from-orange-500 to-red-500' : ''
            ]"
          >
            <KeyRound v-if="!hasEffectiveApiKey" class="w-12 h-12 text-white" />
            <Mic v-else class="w-12 h-12 text-white" />
          </div>
        </button>
        <div class="space-y-1">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-white/35">
            {{ primaryActionLabel }}
          </p>
          <p class="text-xs text-white/25">
            {{ primaryActionHint }}
          </p>
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
              No browser key is saved and `GEMINI_API_KEY` is empty. Open the API Key window and save your personal key to continue.
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
        Powered by Gemini 2.5 Flash • Mislearn
      </p>
    </footer>
  </div>
</template>

<style scoped>
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
