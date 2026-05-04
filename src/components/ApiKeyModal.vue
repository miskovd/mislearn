<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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

const helperText = computed(() => {
  if (props.currentKeyPresent) {
    return 'A browser-stored key is active. You can replace it or clear it.';
  }

  return 'No browser key is stored. The app will fall back to GEMINI_API_KEY only when it is available at build time.';
});

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
      <div v-if="open" class="modal-viewport fixed inset-0 z-[100] overflow-y-auto">
        <div class="fixed inset-0 bg-black/65 backdrop-blur-sm" @click="emit('close')" />

        <Transition name="modal-pop">
          <section class="relative mx-auto max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-[32px] border border-white/10 bg-[#120b08]/95 p-5 text-white shadow-2xl shadow-black/50 sm:p-6">
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

            <p class="mt-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/70">
              {{ helperText }}
            </p>

            <label class="mt-5 block space-y-2">
              <span class="text-xs uppercase tracking-[0.24em] text-white/35">Gemini API Key</span>
              <input
                v-model="apiKey"
                :type="showKey ? 'text' : 'password'"
                class="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-orange-400/40"
                placeholder="Paste your key here"
                autocomplete="off"
                spellcheck="false"
              />
            </label>

            <div class="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
                @click="showKey = !showKey"
              >
                <Eye v-if="!showKey" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
                <span>{{ showKey ? 'Hide' : 'Show' }}</span>
              </button>

              <div class="flex items-center gap-2">
                <button
                  v-if="currentKeyPresent"
                  type="button"
                  class="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
                  @click="handleClear"
                >
                  Clear
                </button>

                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-400"
                  @click="handleSave"
                >
                  <Save class="h-4 w-4" />
                  <span>Save</span>
                </button>
              </div>
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
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
}
</style>
