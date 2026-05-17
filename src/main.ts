import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = (document.body ?? document.getElementsByTagName('body')[0]) as
  | HTMLElement
  | undefined;

if (!target) {
  throw new Error('0K mount target missing');
}

mount(App, {
  target,
});
