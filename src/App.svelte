<script lang="ts">
  import LibcurlClient from '@mercuryworkshop/libcurl-transport';
  // @ts-expect-error no types
  import scramjetController from '@mercuryworkshop/scramjet-controller/dist/controller.api.js';
  const { Controller, config } = scramjetController;
  config.injectPath = 'WEB_ASSET(controller.inject.js)';
  config.scramjetPath = 'WEB_ASSET(scramjet.js)';
  config.wasmPath = 'WEB_ASSET(scramjet.wasm)';

  const upsertServiceWorker = async () => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const sw = navigator.serviceWorker.controller || registration.active;
    if (!sw) throw new Error('service worker not present');
    return sw;
  };

  const runTest = async () => {
    console.log('initializing service worker');
    const serviceworker = await upsertServiceWorker();
    console.log('going');
    const transport = new LibcurlClient({ wisp: 'wss://anura.pro/' });
    const controller = new Controller({
      serviceworker,
      transport,
    });
    console.log('waiting');
    await controller.wait();
    console.log(controller);
  };
</script>

<button onclick={runTest}>Test</button>
