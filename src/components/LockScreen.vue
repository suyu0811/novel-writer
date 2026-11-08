<script setup lang="ts">
import { ref } from 'vue'
import { checkPassword } from '../lib/settings'

const emit = defineEmits<{ (e: 'unlocked'): void }>()

const pwd = ref('')
const err = ref('')

async function submit() {
  if (!pwd.value) return
  if (await checkPassword(pwd.value)) {
    emit('unlocked')
  } else {
    err.value = '密码不正确'
    pwd.value = ''
  }
}
</script>

<template>
  <div class="lock-screen">
    <div class="lock-box">
      <div class="lock-logo">墨</div>
      <div class="lock-title">输入密码</div>
      <div class="lock-sub">密码只保存在本机，用于防止他人打开 App</div>
      <input
        v-model="pwd"
        class="lock-input"
        inputmode="numeric"
        type="password"
        maxlength="6"
        placeholder="· · · ·"
        autofocus
        @keydown.enter.prevent="submit"
      />
      <div class="lock-err">{{ err }}</div>
      <button class="sheet-btn primary lock-btn" @click="submit">解锁</button>
    </div>
  </div>
</template>
