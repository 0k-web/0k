/// <reference lib="webworker" />
declare const globalThis: ServiceWorkerGlobalScope;

// @ts-expect-error no types
import scramjetController from '@mercuryworkshop/scramjet-controller/dist/controller.sw.js';
const { shouldRoute, route } = scramjetController;

globalThis.addEventListener('install', () => {
  void globalThis.skipWaiting();
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim());
});

globalThis.addEventListener('fetch', (event) => {
  if (shouldRoute(event)) {
    event.respondWith(route(event));
  }
});
