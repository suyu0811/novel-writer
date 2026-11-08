<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { closeModal, closeSheet, runSheetOption, sheetJustOpened, ui } from '../lib/ui'

const inputEl = ref<HTMLInputElement | null>(null)

watch(
  () => ui.modal,
  async (m) => {
    if (m?.kind === 'prompt') {
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
    }
  }
)

function ok() {
  const m = ui.modal
  if (!m) return
  if (m.kind === 'prompt') {
    const v = (m.value || '').trim()
    closeModal(v || null)
  } else closeModal(true)
}

function cancel() {
  const m = ui.modal
  if (!m) return
  closeModal(m.kind === 'prompt' ? null : false)
}
</script>

<template>
  <!-- 输入 / 确认 -->
  <div v-if="ui.modal" class="modal-mask" @click.self="cancel">
    <div class="modal">
      <h3>{{ ui.modal.title }}</h3>
      <p v-if="ui.modal.message">{{ ui.modal.message }}</p>
      <input
        v-if="ui.modal.kind === 'prompt'"
        ref="inputEl"
        v-model="ui.modal.value"
        :placeholder="ui.modal.placeholder"
        @keydown.enter.prevent="ok"
        @keydown.esc.prevent="cancel"
      />
      <div class="acts">
        <button class="sheet-btn" @click="cancel">取消</button>
        <button class="sheet-btn primary" @click="ok">确定</button>
      </div>
    </div>
  </div>

  <!-- 长按动作面板 -->
  <div v-if="ui.sheet" class="sheet-mask bottom" @click.self="closeSheet">
    <div class="action-sheet">
      <div class="as-title">{{ ui.sheet.title }}</div>
      <button
        v-for="(o, i) in ui.sheet.options"
        :key="i"
        class="as-item"
        :class="{ danger: o.danger }"
        @click="!sheetJustOpened() && runSheetOption(o)"
      >
        <span class="as-label">{{ o.label }}</span>
        <span v-if="o.hint" class="as-hint">{{ o.hint }}</span>
      </button>
      <button class="as-cancel" @click="closeSheet">取消</button>
    </div>
  </div>

  <div v-if="ui.toast" class="toast">{{ ui.toast }}</div>
</template>
