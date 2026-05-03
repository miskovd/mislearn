import { createApp } from 'vue';
import App from './App.vue';
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Failed to register service worker:', error);
    });
  });
}

createApp(App).mount('#root');
