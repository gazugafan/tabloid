import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { applyCachedAppearance } from '../../utils/appearance';
import '../../assets/base.css';

// Paint the last used look right away; the stored preferences are applied once loaded.
applyCachedAppearance();

createApp(App).use(createPinia()).mount('#app');
