import { createApp } from 'vue';
import App from './App.vue';
import './index.css';

createApp(App).mount('#root');

requestAnimationFrame(() => {
  const loader = document.getElementById('app-loader');
  loader?.classList.add('is-ready');
  window.setTimeout(() => loader?.remove(), 320);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Failed to register service worker:', error);
    });
  });
}
