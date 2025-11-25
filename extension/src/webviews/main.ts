import { mount } from 'svelte';
import './app.css'; // Ensure you have this file or use the global CSS from extension
import App from './app/App.svelte';

const target = document.getElementById('app');

if (!target) {
    throw new Error('Root element #app not found');
}

const app = mount(App, {
    target: target,
});

export default app;