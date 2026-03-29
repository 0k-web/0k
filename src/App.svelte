<script lang="ts">
  import Controls from './Controls.svelte';
  import Frame, { getGo } from './Frame.svelte';
  import Settings from './settings/Settings.svelte';

  let url = $state('');
  let go = $derived(getGo());
  let settingsOpen = $state(false);
</script>

<Frame urlchange={(u) => (url = u)} openSettings={() => (settingsOpen = true)} />
{#if go}
  <Controls {url} {go} />
{/if}
{#if settingsOpen}
  <Settings close={() => (settingsOpen = false)} />
{/if}
