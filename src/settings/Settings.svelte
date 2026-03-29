<script lang="ts">
  import CreateLocalSite from './CreateLocalSite.svelte';
  import { keyGitHubBehavior } from './settingsLocalStorage';

  let { close }: { close: () => void } = $props();

  let cacheKeys: string[] = $state([]);
  const updateCaches = () => caches.keys().then((keys) => (cacheKeys = keys));
  updateCaches();

  let localSiteOpen = $state(false);
</script>

<dialog
  ontoggle={(e) => {
    if (e.newState == 'closed') close();
  }}
  closedby="any"
  {@attach (node) => node.showModal()}
>
  <label class="split">
    <p>Reroute <code>github.io</code></p>
    <select
      bind:value={
        () => localStorage[keyGitHubBehavior] || 'githubusercontent',
        (v) => (localStorage[keyGitHubBehavior] = v)
      }
    >
      <option value="githubusercontent">Via raw.githubusercontent.com</option>
      <option value="jsdelivr">Via cdn.jsdelivr.net</option>
      <option value="off">Off</option>
    </select>
  </label>
  <div class="split">
    <p>Local sites</p>
    <div class="chips">
      <div class="chip">home.0k</div>
      {#each cacheKeys
        .filter((k) => k.startsWith('0k-site/'))
        .map((k) => k.slice('0k-site/'.length)) as site}
        <button class="chip" onclick={() => caches.delete(`0k-site/${site}`).finally(updateCaches)}
          >{site}.0k &times;</button
        >
      {/each}
      <button class="chip" onclick={() => (localSiteOpen = true)}>+</button>
    </div>
  </div>
</dialog>

{#if localSiteOpen}
  <CreateLocalSite
    close={() => {
      localSiteOpen = false;
      updateCaches();
    }}
  />
{/if}

<style>
  dialog {
    display: flex;
    flex-direction: column;
    background-color: var(--m3c-surface-container);

    width: auto;
    max-width: 50rem;
    margin-inline: auto;
    inset: auto 0 0 0;
    z-index: 1;

    border-start-start-radius: 1rem;
    border-start-end-radius: 1rem;
    padding: 1.5rem;

    transition: translate var(--transition);
    --transition: cubic-bezier(0.05, 0.7, 0.1, 1) 400ms;

    @starting-style {
      translate: 0 100%;
    }
  }
  dialog::backdrop {
    background-color: oklch(from var(--m3c-scrim) l c h / 0.5);
    transition: background-color var(--transition);

    @starting-style {
      background-color: transparent;
    }
  }

  .split {
    display: grid;
    grid-template-columns: 1fr auto;
    min-height: 4rem;
    align-items: center;
  }
  select {
    background-color: var(--m3c-surface-container-highest);
    border-radius: 1rem;
    padding-inline: 0.5rem;
    align-self: stretch;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .chip {
    display: flex;
    align-items: center;
    height: 1.5rem;
    padding-inline: 0.5rem;
    border-radius: 0.5rem;
    background-color: var(--m3c-surface-container-highest);
  }
</style>
