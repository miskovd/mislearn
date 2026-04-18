<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Settings2, Save, X } from 'lucide-vue-next';
import {
  getDefaultProfileSettings,
  getLanguageLabel,
  getStoredProfileSettings,
  setStoredProfileSettings,
  type NativeLanguage
} from '../lib/profile-settings';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'saved'): void;
}>();

const nativeLanguage = ref<NativeLanguage>(getDefaultProfileSettings().nativeLanguage);
const isSaved = ref(false);

const languageOptions: Array<{ value: NativeLanguage; label: string }> = [
  { value: 'fr', label: 'French' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ru', label: 'Russian' }
];

const helperText = computed(() => {
  const current = getLanguageLabel(nativeLanguage.value);
  return `The tutor will explain difficult parts and translations in ${current}.`;
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      nativeLanguage.value = getStoredProfileSettings().nativeLanguage;
      isSaved.value = false;
    }
  },
  { immediate: true }
);

function handleSave() {
  setStoredProfileSettings({
    nativeLanguage: nativeLanguage.value
  });
  isSaved.value = true;
  emit('saved');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="fixed inset-0 z-[60]">
        <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" @click="emit('close')" />

        <Transition name="modal-pop">
          <section class="absolute left-1/2 top-1/2 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-white/10 bg-[#120b08]/95 p-6 text-white shadow-2xl shadow-black/50">
            <header class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3">
                <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
                  <Settings2 class="h-5 w-5" />
                </div>
                <div>
                  <h2 class="text-xl font-semibold tracking-tight">Profile settings</h2>
                  <p class="mt-1 text-sm text-white/45">
                    Choose the native language used for explanations and translations.
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

            <div class="mt-5 space-y-2">
              <span class="text-xs uppercase tracking-[0.24em] text-white/35">Native language</span>
              <div class="grid gap-3 sm:grid-cols-3">
                <button
                  v-for="option in languageOptions"
                  :key="option.value"
                  type="button"
                  class="rounded-2xl border px-4 py-3 text-left transition"
                  :class="nativeLanguage === option.value
                    ? 'border-amber-400/50 bg-amber-500/15 text-white'
                    : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/5 hover:text-white'"
                  @click="nativeLanguage = option.value"
                >
                  <div class="text-sm font-medium">{{ option.label }}</div>
                  <div class="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">
                    {{ option.value }}
                  </div>
                </button>
              </div>
            </div>

            <div class="mt-5 flex items-center justify-between gap-3">
              <p class="text-sm text-white/35">
                Default language is French.
              </p>

              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-400"
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
  transform: translate(-50%, -48%) scale(0.96);
}
</style>
