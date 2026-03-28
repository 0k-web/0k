<script lang="ts" module>
  import scramjetController from '@mercuryworkshop/scramjet-controller/dist/controller.api.js';
  const { Controller, config } = scramjetController;
  config.injectPath = 'WEB_ASSET(controller.inject.js)';
  config.scramjetPath = 'WEB_ASSET(scramjet.js)';
  config.wasmPath = 'WEB_ASSET(scramjet.wasm)';

  let _go: ((url: string) => void) | undefined = $state();
  export const getGo = () => _go;
</script>

<script lang="ts">
  import LibcurlClient from '@mercuryworkshop/libcurl-transport';
  import loadingHome from './assets/loading-home.html?url&inline';

  const upsertServiceWorker = async () => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const sw = navigator.serviceWorker.controller || registration.active;
    if (!sw) throw new Error('service worker not present');
    return sw;
  };

  let { urlchange }: { urlchange: (url: string) => void } = $props();

  let status = $state('0K is loading');
  const load = async (placeholder: HTMLDivElement) => {
    status = 'Setting up service worker';
    const serviceworker = await upsertServiceWorker();

    status = 'Initializing controls';
    const transport = new LibcurlClient({ wisp: 'wss://anura.pro/' });
    const controller = new Controller({
      serviceworker,
      transport,
    });

    status = 'Loading controls';
    await controller.wait();

    const frame = controller.createFrame();
    placeholder.replaceWith(frame.element);
    frame.element.src = loadingHome;

    frame.element.addEventListener('load', () => {
      urlchange(
        globalThis.$scramjet.unrewriteUrl(
          frame.element.contentWindow!.location.href,
          frame.context,
        ),
      );
    });
    _go = (url) => frame.go(url);
    frame.go('https://news.ycombinator.com/');
  };
</script>

<div
  class="placeholder"
  {@attach (node) => {
    load(node);
  }}
>
  <span class="loading">{status}</span>
</div>

<style>
  :global(iframe) {
    width: 100%;
    height: 100%;
  }
  .placeholder {
    display: grid;
    place-items: center;
  }
  .loading {
    font-size: 2rem;
    --bg: var(--m3c-on-surface);
    --fg: color-mix(in oklch, var(--m3c-primary) 50%, var(--m3c-primary-container));
    background-image: linear-gradient(
      in oklab to right,
      var(--bg) 0%,
      var(--bg) 2.5%,
      var(--bg) 5%,
      var(--bg) 7.5%,
      var(--bg) 10%,
      var(--bg) 12.5%,
      var(--bg) 15%,
      var(--bg) 17.5%,
      color-mix(in oklab, var(--fg) 1%, var(--bg)) 20%,
      color-mix(in oklab, var(--fg) 3%, var(--bg)) 22.5%,
      color-mix(in oklab, var(--fg) 7%, var(--bg)) 25%,
      color-mix(in oklab, var(--fg) 13%, var(--bg)) 27.5%,
      color-mix(in oklab, var(--fg) 21%, var(--bg)) 30%,
      color-mix(in oklab, var(--fg) 31%, var(--bg)) 32.5%,
      color-mix(in oklab, var(--fg) 43%, var(--bg)) 35%,
      color-mix(in oklab, var(--fg) 56%, var(--bg)) 37.5%,
      color-mix(in oklab, var(--fg) 69%, var(--bg)) 40%,
      color-mix(in oklab, var(--fg) 81%, var(--bg)) 42.5%,
      color-mix(in oklab, var(--fg) 91%, var(--bg)) 45%,
      color-mix(in oklab, var(--fg) 97%, var(--bg)) 47.5%,
      color-mix(in oklab, var(--fg) 100%, var(--bg)) 50%,
      color-mix(in oklab, var(--fg) 97%, var(--bg)) 52.5%,
      color-mix(in oklab, var(--fg) 91%, var(--bg)) 55%,
      color-mix(in oklab, var(--fg) 81%, var(--bg)) 57.5%,
      color-mix(in oklab, var(--fg) 69%, var(--bg)) 60%,
      color-mix(in oklab, var(--fg) 56%, var(--bg)) 62.5%,
      color-mix(in oklab, var(--fg) 43%, var(--bg)) 65%,
      color-mix(in oklab, var(--fg) 31%, var(--bg)) 67.5%,
      color-mix(in oklab, var(--fg) 21%, var(--bg)) 70%,
      color-mix(in oklab, var(--fg) 13%, var(--bg)) 72.5%,
      color-mix(in oklab, var(--fg) 7%, var(--bg)) 75%,
      color-mix(in oklab, var(--fg) 3%, var(--bg)) 77.5%,
      color-mix(in oklab, var(--fg) 1%, var(--bg)) 80%,
      var(--bg) 82.5%,
      var(--bg) 85%,
      var(--bg) 87.5%,
      var(--bg) 90%,
      var(--bg) 92.5%,
      var(--bg) 95%,
      var(--bg) 97.5%,
      var(--bg) 100%
    );
    background-clip: text;
    background-size: 200% 100%;
    color: transparent;
    animation: pulse 2s infinite linear;
  }
  @keyframes pulse {
    0% {
      background-position: 0% 0%;
    }
    100% {
      background-position: 200% 0%;
    }
  }
</style>
