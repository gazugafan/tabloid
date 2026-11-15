import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

import { applyCachedAppearance } from '../../utils/appearance';
import '../../assets/base.css';

applyCachedAppearance();

createApp(App).use(createPinia()).mount('#app');
