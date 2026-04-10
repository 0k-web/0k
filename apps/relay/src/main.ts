import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.body;
if (!target) throw new Error('Mount target missing');

mount(App, { target });
