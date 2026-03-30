<script lang="ts">
  import Controls from './Controls.svelte';
  import ConnectDialog from './ConnectDialog.svelte';
  import Frame, { getGo } from './Frame.svelte';
  import Settings from './settings/Settings.svelte';
  import { getWebRtcState } from './webrtc-state.svelte';

  let url = $state('');
  let go = $derived(getGo());
  let settingsOpen = $state(false);
  const webrtc = getWebRtcState();
</script>

<svelte:window
  onmessage={(e) => {
    if (e.data == 'opensettings') {
      settingsOpen = true;
    }
  }}
/>
<Frame urlchange={(u) => (url = u)} />
{#if webrtc.promptOpen}
  <ConnectDialog />
{/if}
{#if go}
  <Controls {url} {go} />
{/if}
{#if settingsOpen}
  <Settings close={() => (settingsOpen = false)} />
{/if}
