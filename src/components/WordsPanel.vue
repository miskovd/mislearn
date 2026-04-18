<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { BookOpen, Clock3, Loader2, MessageSquarePlus, Languages, Plus, Trash2, X } from 'lucide-vue-next';
import { createWord, deleteWord, fetchWords, type WordEntry } from '../lib/words-api';
import { getLanguageLabel, type NativeLanguage } from '../lib/profile-settings';
import type { PracticeDirection } from '../hooks/useGeminiLive';

const props = defineProps<{
  open: boolean;
  nativeLanguage: NativeLanguage;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'practice', payload: { word: WordEntry; direction: PracticeDirection }): void;
}>();

const words = ref<WordEntry[]>([]);
const loading = ref(false);
const loadingError = ref<string | null>(null);
const submitting = ref(false);
const showForm = ref(false);

const form = ref({
  word: '',
  translation: '',
  context: ''
});

const hasWords = computed(() => words.value.length > 0);

async function loadWords() {
  loading.value = true;
  loadingError.value = null;

  try {
    words.value = await fetchWords();
  } catch (error) {
    loadingError.value = error instanceof Error ? error.message : 'Failed to load words.';
  } finally {
    loading.value = false;
  }
}

async function handleAddWord() {
  if (!form.value.word.trim()) {
    loadingError.value = 'Word is required.';
    return;
  }

  submitting.value = true;
  loadingError.value = null;

  try {
    await createWord({
      word: form.value.word,
      translation: form.value.translation,
      context: form.value.context
    });

    form.value = { word: '', translation: '', context: '' };
    showForm.value = false;
    await loadWords();
  } catch (error) {
    loadingError.value = error instanceof Error ? error.message : 'Failed to add word.';
  } finally {
    submitting.value = false;
  }
}

async function handleDeleteWord(id: number) {
  try {
    await deleteWord(id);
    words.value = words.value.filter((word) => word.id !== id);
  } catch (error) {
    loadingError.value = error instanceof Error ? error.message : 'Failed to delete word.';
  }
}

function startPractice(word: WordEntry, direction: PracticeDirection) {
  emit('practice', { word, direction });
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await nextTick();
      await loadWords();
    } else {
      showForm.value = false;
    }
  },
  { immediate: true }
);
</script>

<template>
  <Teleport to="body">
    <Transition name="panel-fade">
      <div v-if="open" class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="emit('close')" />

        <Transition name="panel-slide">
          <aside class="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-white/10 bg-[#120b08]/95 text-white shadow-2xl shadow-black/40">
            <header class="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
                  <BookOpen class="h-5 w-5" />
                </div>
                <div>
                  <h2 class="text-lg font-semibold tracking-tight">My words</h2>
                  <p class="text-xs uppercase tracking-[0.24em] text-white/35">Mislearn vocabulary notebook</p>
                </div>
              </div>

              <button
                type="button"
                class="rounded-full border border-white/10 p-2 text-white/60 transition hover:bg-white/5 hover:text-white"
                @click="emit('close')"
              >
                <X class="h-4 w-4" />
              </button>
            </header>

            <div class="border-b border-white/10 px-6 py-4">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-400"
                @click="showForm = !showForm"
              >
                <Plus class="h-4 w-4" />
                <span>{{ showForm ? 'Close form' : 'Add word' }}</span>
              </button>

              <Transition name="form-drop">
                <form v-if="showForm" class="mt-4 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4" @submit.prevent="handleAddWord">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="space-y-2">
                      <span class="text-xs uppercase tracking-[0.2em] text-white/35">Word</span>
                      <input
                        v-model="form.word"
                        type="text"
                        class="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-amber-400/40"
                        placeholder="serendipity"
                      />
                    </label>

                    <label class="space-y-2">
                      <span class="text-xs uppercase tracking-[0.2em] text-white/35">Translation</span>
                      <input
                        v-model="form.translation"
                        type="text"
                        class="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-amber-400/40"
                        placeholder="счастливая случайность"
                      />
                    </label>
                  </div>

                  <label class="space-y-2 block">
                    <span class="text-xs uppercase tracking-[0.2em] text-white/35">Context</span>
                    <textarea
                      v-model="form.context"
                      rows="3"
                      class="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-amber-400/40"
                      placeholder="How you heard this word in dialog"
                    />
                  </label>

                  <div class="flex items-center justify-between gap-3">
                    <p class="text-xs text-white/35">Save learned words without leaving the lesson.</p>
                    <button
                    type="submit"
                    :disabled="submitting"
                    class="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#120b08] transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                      <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" />
                      <span>{{ submitting ? 'Saving...' : 'Save word' }}</span>
                    </button>
                  </div>
                </form>
              </Transition>

              <p v-if="loadingError" class="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ loadingError }}
              </p>
            </div>

            <div class="flex-1 overflow-y-auto px-6 py-5">
              <div v-if="loading" class="flex h-full items-center justify-center text-white/40">
                <Loader2 class="mr-2 h-5 w-5 animate-spin" />
                Loading words...
              </div>

              <div v-else-if="!hasWords" class="flex h-full flex-col items-center justify-center text-center text-white/35">
                <div class="mb-4 rounded-full border border-white/10 bg-white/5 p-4">
                  <Clock3 class="h-6 w-6 text-amber-300" />
                </div>
                <p class="text-sm font-medium text-white/70">No saved words yet</p>
                <p class="mt-2 max-w-sm text-sm leading-relaxed">
                  Open the form above and save words from your dialog. They will stay in SQLite on this server.
                </p>
              </div>

              <div v-else class="space-y-3">
                <article
                  v-for="word in words"
                  :key="word.id"
                  class="rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:border-white/15 hover:bg-white/7"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                      <h3 class="truncate text-base font-semibold text-white">{{ word.word }}</h3>
                      <p v-if="word.translation" class="mt-1 text-sm text-amber-200">{{ word.translation }}</p>
                    </div>

                    <button
                      type="button"
                      class="rounded-full border border-white/10 p-2 text-white/40 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200"
                      @click="handleDeleteWord(word.id)"
                    >
                      <Trash2 class="h-4 w-4" />
                    </button>
                  </div>

                  <p v-if="word.context" class="mt-3 text-sm leading-relaxed text-white/65">
                    {{ word.context }}
                  </p>

                  <div class="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-xs font-medium text-white/75 transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-white"
                      @click="startPractice(word, 'english-to-native')"
                    >
                      <MessageSquarePlus class="h-4 w-4" />
                      <span>English → {{ getLanguageLabel(props.nativeLanguage) }}</span>
                    </button>

                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-xs font-medium text-white/75 transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-white"
                      @click="startPractice(word, 'native-to-english')"
                    >
                      <Languages class="h-4 w-4" />
                      <span>{{ getLanguageLabel(props.nativeLanguage) }} → English</span>
                    </button>
                  </div>

                  <p class="mt-4 text-[10px] uppercase tracking-[0.24em] text-white/25">
                    Added {{ new Date(word.createdAt).toLocaleString() }}
                  </p>
                </article>
              </div>
            </div>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.25s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
}

.form-drop-enter-active,
.form-drop-leave-active {
  transition: all 0.2s ease;
}

.form-drop-enter-from,
.form-drop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
