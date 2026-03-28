<script lang="ts">
  import Controls from './Controls.svelte';
  import Frame, { getGo } from './Frame.svelte';

  let url = $state('');
  let go = $derived(getGo());
</script>

<Frame urlchange={(u) => (url = u)} />
{#if go}
  <Controls {url} {go} />
{/if}
