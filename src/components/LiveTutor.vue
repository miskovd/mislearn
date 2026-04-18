<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useGeminiLive } from '../hooks/useGeminiLive';
import WordsPanel from './WordsPanel.vue';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  AlertCircle, 
  MessageSquare, 
  Sparkles,
  BookOpen
} from 'lucide-vue-next';

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
    <header class="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/20">
          <Sparkles class="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 class="text-xl font-semibold tracking-tight">LingoLive AI</h1>
          <p class="text-xs text-white/40 uppercase tracking-widest font-medium">English Tutor</p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button
          type="button"
          class="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          @click="isWordsPanelOpen = true"
        >
          <BookOpen class="h-4 w-4" />
          <span>My words</span>
        </button>

        <div v-if="isConnected" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span class="text-xs font-medium text-emerald-500">Live Session</span>
        </div>
        <button 
          @click="isConnected ? stopSession() : startSession()"
          :class="[
            'flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all duration-300',
            isConnected 
              ? 'bg-white/5 hover:bg-white/10 border border-white/10 text-white' 
              : 'bg-orange-600 hover:bg-orange-500 text-white shadow-xl shadow-orange-600/20'
          ]"
        >
          <template v-if="isConnected">
            <MicOff class="w-4 h-4" />
            <span>End Session</span>
          </template>
          <template v-else>
            <Mic class="w-4 h-4" />
            <span>Start Practice</span>
          </template>
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="relative z-10 flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-8 overflow-hidden">
      <div v-if="error" class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400">
        <AlertCircle class="w-5 h-5 flex-shrink-0" />
        <p class="text-sm font-medium">{{ error }}</p>
      </div>

      <div v-if="!isConnected && !error" class="flex-1 flex flex-col items-center justify-center text-center space-y-8">
        <div class="relative">
          <div class="absolute inset-0 bg-orange-600/20 blur-3xl rounded-full" />
          <div class="relative w-32 h-32 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-2xl">
            <Mic class="w-12 h-12 text-white" />
          </div>
        </div>
        <div class="max-w-md space-y-4">
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
              {{ msg.role === 'user' ? 'You' : 'LingoLive' }}
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
      @close="isWordsPanelOpen = false"
    />

    <!-- Footer -->
    <footer class="relative z-10 px-8 py-4 text-center">
      <p class="text-[10px] text-white/20 uppercase tracking-[0.2em] font-medium">
        Powered by Gemini 2.5 Flash • AI English Tutor
      </p>
    </footer>
  </div>
</template>

<style scoped>
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
</style>
