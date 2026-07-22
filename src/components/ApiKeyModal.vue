<script setup lang="ts">
import { ref, watch } from 'vue';
import { KeyRound, Eye, EyeOff, Save, X } from 'lucide-vue-next';
import { clearStoredGeminiApiKey, getStoredGeminiApiKey, setStoredGeminiApiKey } from '../lib/gemini-api-key';

const props = defineProps<{
  open: boolean;
  currentKeyPresent: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'saved'): void;
}>();

const apiKey = ref('');
const showKey = ref(false);
const isSaved = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      apiKey.value = getStoredGeminiApiKey();
      showKey.value = false;
      isSaved.value = false;
    }
  },
  { immediate: true }
);

function handleSave() {
  setStoredGeminiApiKey(apiKey.value);
  isSaved.value = true;
  emit('saved');
}

function handleClear() {
  clearStoredGeminiApiKey();
  apiKey.value = '';
  isSaved.value = true;
  emit('saved');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="modal-viewport fixed inset-0 z-[100]">
        <div class="fixed inset-0 bg-black/45 backdrop-blur-md" @click="emit('close')" />

        <Transition name="modal-pop">
          <section class="modal-glass relative max-h-full w-full max-w-[520px] overflow-y-auto rounded-[32px] border border-orange-100/20 p-5 text-white shadow-2xl shadow-black/50 sm:p-6">
            <header class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3">
                <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-300">
                  <KeyRound class="h-5 w-5" />
                </div>
                <div>
                  <h2 class="text-xl font-semibold tracking-tight">AI API Key</h2>
                  <p class="mt-1 text-sm text-white/45">
                    Stored locally in your browser for this device only.
                  </p>
                </div>
              </div>

              <button
                type="button"
                class="rounded-full border border-white/10 p-2 text-white/55 transition hover:bg-white/5 hover:text-white"
                @click="emit('close')"
              >
                <X class="h-4 w-4" />
              </button>
            </header>

            <a
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-200/20 bg-orange-500/10 px-4 py-3 text-sm font-medium text-orange-50 transition hover:border-orange-200/35 hover:bg-orange-500/18"
            >
              <KeyRound class="h-4 w-4" />
              <span>Create a FREE Gemini API Key</span>
            </a>

            <label class="mt-5 block space-y-2">
              <span class="text-xs uppercase tracking-[0.24em] text-white/35">Gemini API Key</span>
              <div class="relative">
                <input
                  v-model="apiKey"
                  :type="showKey ? 'text' : 'password'"
                  class="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-4 pr-12 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-orange-400/40"
                  placeholder="Paste your key here"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
                  :aria-label="showKey ? 'Hide API key' : 'Show API key'"
                  @click="showKey = !showKey"
                >
                  <Eye v-if="!showKey" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
            </label>

            <div class="mt-4 flex w-full items-center gap-2">
                <button
                  v-if="currentKeyPresent"
                  type="button"
                  class="min-w-0 flex-1 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white sm:flex-none"
                  @click="handleClear"
                >
                  Clear
                </button>

                <button
                  type="button"
                  class="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-400 sm:flex-none"
                  @click="handleSave"
                >
                  <Save class="h-4 w-4" />
                  <span>Save</span>
                </button>
            </div>

            <p v-if="isSaved" class="mt-4 text-sm text-emerald-300">
              Saved to this browser.
            </p>
          </section>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-pop-enter-active,
.modal-pop-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-pop-enter-from,
.modal-pop-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem) scale(0.98);
}

.modal-viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
}

.modal-glass {
  background: linear-gradient(145deg, rgba(62, 28, 13, 0.78), rgba(22, 10, 5, 0.68));
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 242, 222, 0.2), inset 0 -1px 0 rgba(255, 146, 60, 0.13);
  backdrop-filter: blur(24px) saturate(135%);
  -webkit-backdrop-filter: blur(24px) saturate(135%);
}
</style>
