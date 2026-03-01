<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

function goToConfig() {
  router.push('/config');
}
</script>

<template>
  <router-view />
</template>

<style>
@import url('https://at.alicdn.com/t/c/font_2996356_1b8z5k9z5k.css');
</style>
