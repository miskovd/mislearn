<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { BookOpen, Clock3, Cloud, Download, FileUp, Loader2, LogOut, MessageSquarePlus, Languages, Plus, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-vue-next';
import {
  createLocalWord,
  createRemoteWord,
  deleteLocalWord,
  deleteRemoteWord,
  fetchLocalWords,
  fetchRemoteWords,
  updateLocalWordRating,
  updateRemoteWordRating,
  updateLocalWord,
  updateRemoteWord,
  type WordEntry
} from '../lib/words-api';
import { IMPORT_OPTIONS_KEY, buildImportPlan, parseCsv, wordsToCsv, type ImportConflictOption } from '../lib/csv';
import { startGoogleSignIn, type AuthUser } from '../lib/auth-api';
import { getLanguageLabel, type NativeLanguage } from '../lib/profile-settings';
import type { PracticeDirection } from '../hooks/useGeminiLive';

const props = defineProps<{
  open: boolean;
  nativeLanguage: NativeLanguage;
  user: AuthUser | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'practice', payload: { word: WordEntry; direction: PracticeDirection }): void;
  (event: 'sign-out'): void;
}>();

const words = ref<WordEntry[]>([]);
const loading = ref(false);
const loadingError = ref<string | null>(null);
const submitting = ref(false);
const showForm = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const importOption = ref<ImportConflictOption>((localStorage.getItem(IMPORT_OPTIONS_KEY) as ImportConflictOption) || 'keep');
const showOptions = ref(false);
const showTrainer = ref(false);
const importNotice = ref('');
const addFormRef = ref<HTMLFormElement | null>(null);

const form = ref({
  word: '',
  translation: '',
  context: ''
});

const hasWords = computed(() => words.value.length > 0);
const isSignedIn = computed(() => Boolean(props.user));
const userInitial = computed(() => {
  const label = props.user?.name || props.user?.email || '?';
  return label.trim().charAt(0).toUpperCase() || '?';
});

async function loadWords() {
  loading.value = true;
  loadingError.value = null;

  try {
    words.value = isSignedIn.value ? await fetchRemoteWords() : await fetchLocalWords();
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
    const createWord = isSignedIn.value ? createRemoteWord : createLocalWord;

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
    const deleteWord = isSignedIn.value ? deleteRemoteWord : deleteLocalWord;

    await deleteWord(id);
    words.value = words.value.filter((word) => word.id !== id);
  } catch (error) {
    loadingError.value = error instanceof Error ? error.message : 'Failed to delete word.';
  }
}

async function setRating(word: WordEntry, rating: number) {
  try {
    const update = isSignedIn.value ? updateRemoteWordRating : updateLocalWordRating;
    const saved = await update(word.id, rating);
    if (saved) words.value = words.value.map((entry) => entry.id === word.id ? saved : entry);
  } catch (error) { loadingError.value = error instanceof Error ? error.message : 'Failed to update rating.'; }
}

function downloadCsv() {
  const url = URL.createObjectURL(new Blob([wordsToCsv(words.value)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'mislearn-words.csv'; link.click(); URL.revokeObjectURL(url);
}

async function importCsv(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const parsed = parseCsv(await file.text());
    const plan = buildImportPlan(words.value, parsed.entries, importOption.value);
    for (const update of plan.updates) {
      await (isSignedIn.value ? updateRemoteWord : updateLocalWord)(update.id, update.payload);
    }
    for (const entry of plan.creates) {
      await (isSignedIn.value ? createRemoteWord : createLocalWord)(entry);
    }
    await loadWords(); importNotice.value = `Imported ${plan.creates.length + plan.updates.length}; skipped ${parsed.skipped + plan.skipped}.`;
  } catch (error) { loadingError.value = error instanceof Error ? error.message : 'Could not import CSV.'; }
  finally { (event.target as HTMLInputElement).value = ''; }
}

function saveOptions() { localStorage.setItem(IMPORT_OPTIONS_KEY, importOption.value); showOptions.value = false; }

async function toggleAddForm() {
  showForm.value = !showForm.value;
  if (showForm.value) {
    await nextTick();
    addFormRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function openTrainer() { showTrainer.value = true; }
function chooseTrainer(direction: PracticeDirection) {
  const lowest = Math.min(...words.value.map((word) => word.learnRating));
  const tied = words.value.filter((word) => word.learnRating === lowest).sort(() => Math.random() - 0.5);
  if (tied[0]) startPractice(tied[0], direction);
  showTrainer.value = false;
}

function startPractice(word: WordEntry, direction: PracticeDirection) {
  emit('practice', { word, direction });
}

watch(
  () => [props.open, props.user?.id, props.syncStatus] as const,
  async ([isOpen]) => {
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
        <div class="absolute inset-0 bg-black/42 backdrop-blur-md" @click="emit('close')" />

        <Transition name="panel-slide">
          <aside class="panel-glass absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col overflow-hidden border-l border-orange-100/20 text-white shadow-2xl shadow-black/40">
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

            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div class="border-b border-white/10 px-6 py-4">
              <div
                v-if="!isSignedIn"
                class="mb-4 rounded-3xl border border-orange-300/30 bg-orange-500/15 p-4 shadow-lg shadow-orange-950/20"
              >
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white">
                    <Cloud class="h-4 w-4" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-white">Save your words across devices</p>
                    <p class="mt-1 text-sm leading-relaxed text-orange-50/75">
                      Right now this vocabulary is saved only on this device. Sign in with Google to move it to your account so it will not be lost and can be opened on other devices.
                    </p>
                    <button
                      type="button"
                      class="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#120b08] transition hover:bg-orange-50"
                      @click="startGoogleSignIn"
                    >
                      <ShieldCheck class="h-4 w-4" />
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="mb-4 flex items-center justify-between gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    v-if="props.user?.picture"
                    :src="props.user.picture"
                    :alt="props.user.name || props.user.email"
                    referrerpolicy="no-referrer"
                    class="h-10 w-10 shrink-0 rounded-full border border-white/20 bg-emerald-950/40 object-cover"
                  />
                  <div
                    v-else
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-emerald-700/50 text-sm font-semibold text-emerald-50"
                    :aria-label="props.user?.name || props.user?.email"
                  >
                    {{ userInitial }}
                  </div>

                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-emerald-100">
                      Synced as {{ props.user?.email }}
                    </p>
                    <p class="mt-0.5 text-xs text-emerald-50/55">
                      {{ syncStatus === 'syncing' ? 'Moving local words to your account...' : 'Words are saved on the server.' }}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  class="shrink-0 rounded-full border border-white/10 p-2 text-white/60 transition hover:bg-white/5 hover:text-white"
                  aria-label="Sign out"
                  @click="emit('sign-out')"
                >
                  <Loader2 v-if="syncStatus === 'syncing'" class="h-4 w-4 animate-spin" />
                  <LogOut v-else class="h-4 w-4" />
                </button>
              </div>

              <div class="flex flex-wrap gap-2">
                <button type="button" class="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-400" @click="toggleAddForm"><Plus class="h-4 w-4" /><span>{{ showForm ? 'Close form' : 'Add word' }}</span></button>
                <button type="button" class="rounded-full border border-white/10 p-2 text-white/70 hover:bg-white/10" aria-label="Export CSV" @click="downloadCsv"><Download class="h-4 w-4" /></button>
                <button type="button" class="rounded-full border border-white/10 p-2 text-white/70 hover:bg-white/10" aria-label="Import CSV" @click="importInput?.click()"><FileUp class="h-4 w-4" /></button>
                <button type="button" class="rounded-full border border-white/10 p-2 text-white/70 hover:bg-white/10" aria-label="Import options" @click="showOptions = true"><Settings2 class="h-4 w-4" /></button>
                <button type="button" :disabled="!hasWords" class="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 disabled:opacity-40" @click="openTrainer"><Sparkles class="h-4 w-4" />AI Trainer</button>
                <input ref="importInput" type="file" accept=".csv,text/csv" class="hidden" @change="importCsv" />
              </div>
              <p v-if="importNotice" class="mt-3 text-sm text-emerald-200">{{ importNotice }}</p>

              <Transition name="form-drop">
                <form v-if="showForm" ref="addFormRef" class="mt-4 scroll-mt-4 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4" @submit.prevent="handleAddWord">
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

            <div class="px-6 py-5">
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
                  Open the form above and save words from your dialog. {{ isSignedIn ? 'They will stay in your account on this server.' : 'They will stay in this browser until you sign in.' }}
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

                  <div class="mt-3 flex items-center gap-1" aria-label="Learning rating">
                    <span v-for="rating in [-3, -2, -1, 0, 1, 2, 3]" :key="rating" :title="`Learning rating ${rating}`" :class="word.learnRating === rating ? 'scale-110 text-amber-300 opacity-100' : 'text-white/25 opacity-70'" class="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm transition">{{ rating < 0 ? '☹' : rating === 0 ? '😐' : '😊' }}</span>
                  </div>

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
            </div>
          </aside>
        </Transition>
      </div>
    </Transition>

    <Transition name="panel-fade"><div v-if="showOptions" class="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-5 backdrop-blur-md"><section class="modal-glass w-full max-w-md rounded-3xl border border-orange-100/20 p-6"><div class="flex justify-between"><h2 class="modal-title text-lg font-semibold">Options</h2><button @click="showOptions = false"><X /></button></div><p class="mt-5 text-xs uppercase tracking-widest text-white/40">Import options</p><label class="option-card mt-4 flex gap-3 rounded-2xl border border-white/10 p-4"><input v-model="importOption" value="keep" type="radio" /><span><b class="option-title">Keep my word</b><br><small class="text-white/55">Keep existing entries on conflicts.</small></span></label><label class="option-card mt-3 flex gap-3 rounded-2xl border border-white/10 p-4"><input v-model="importOption" value="replace" type="radio" /><span><b class="option-title">Use imported word</b><br><small class="text-white/55">Replace translation, context and rating.</small></span></label><button class="mt-5 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium" @click="saveOptions">Save options</button></section></div></Transition>
    <Transition name="panel-fade"><div v-if="showTrainer" class="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-5 backdrop-blur-md"><section class="modal-glass w-full max-w-md rounded-3xl border border-orange-100/20 p-6"><div class="flex justify-between"><h2 class="modal-title text-lg font-semibold">AI Trainer</h2><button @click="showTrainer = false"><X /></button></div><p class="mt-3 text-sm text-white/60">Choose a translation direction. Words with the lowest learning rating come first.</p><div class="mt-5 grid gap-3"><button class="rounded-2xl border border-white/20 bg-white/12 p-4 text-left text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_30px_rgba(0,0,0,0.22)] transition hover:border-white/30 hover:bg-white/18 hover:text-white" @click="chooseTrainer('english-to-native')">English → {{ getLanguageLabel(props.nativeLanguage) }}</button><button class="rounded-2xl border border-white/20 bg-white/12 p-4 text-left text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_30px_rgba(0,0,0,0.22)] transition hover:border-white/30 hover:bg-white/18 hover:text-white" @click="chooseTrainer('native-to-english')">{{ getLanguageLabel(props.nativeLanguage) }} → English</button></div></section></div></Transition>
  </Teleport>
</template>

<style scoped>
.panel-glass,
.modal-glass {
  background: linear-gradient(145deg, rgba(62, 28, 13, 0.78), rgba(22, 10, 5, 0.68));
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 242, 222, 0.2), inset 0 -1px 0 rgba(255, 146, 60, 0.13);
  backdrop-filter: blur(24px) saturate(135%);
  -webkit-backdrop-filter: blur(24px) saturate(135%);
}

.modal-title {
  color: rgba(255, 250, 244, 0.96);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.22);
}

.option-card {
  color: rgba(255, 248, 240, 0.95);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.07));
  backdrop-filter: blur(16px) saturate(130%);
  -webkit-backdrop-filter: blur(16px) saturate(130%);
}

.option-card b {
  color: rgba(255, 252, 248, 0.98);
}

.option-title {
  color: rgba(255, 252, 248, 0.98);
}

.option-card small {
  color: rgba(255, 245, 236, 0.72);
}

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
