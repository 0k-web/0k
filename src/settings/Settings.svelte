<script lang="ts">
  import CreateLocalSite from './CreateLocalSite.svelte';
  import { githubBehaviorOptions, normalizeGitHubBehavior } from '../githubBehavior';
  import { keyGitHubBehavior } from './settingsLocalStorage';
  import { getTunnelState, detectMode, patchTunnelState } from '../tunnel-state.svelte';

  let { close }: { close: () => void } = $props();

  let cacheKeys: string[] = $state([]);
  const updateCaches = () => caches.keys().then((keys) => (cacheKeys = keys));
  updateCaches();

  let localSiteOpen = $state(false);

  const tunnel = getTunnelState();
  let hostInput = $state(localStorage['0k/tunnel-input'] || tunnel.host || tunnel.code || '');

  const saveInput = () => {
    const input = hostInput.trim();
    if (input) {
      localStorage['0k/tunnel-input'] = input;
      patchTunnelState(detectMode(input));
    }
  };

  const getGitHubBehavior = () =>
    normalizeGitHubBehavior(localStorage[keyGitHubBehavior], defaultGitHubBehavior);
  const setGitHubBehavior = (value: string) => {
    localStorage[keyGitHubBehavior] = normalizeGitHubBehavior(value, defaultGitHubBehavior);
  };
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
    <select bind:value={() => getGitHubBehavior(), (value) => setGitHubBehavior(value)}>
      {#each githubBehaviorOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>
  <div class="split">
    <p>Local sites</p>
    <div class="chips">
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

  <label class="split">
    <p>Tunnel</p>
    <input
      type="text"
      bind:value={hostInput}
      onblur={saveInput}
      placeholder="IP address or 4-char Nostr code"
      autocomplete="off"
      spellcheck="false"
    />
  </label>
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
  button {
    display: flex;
    align-items: center;
    height: 2rem;
    padding-inline: 1rem;
    border-radius: 1rem;
    background-color: var(--m3c-surface-container-highest);
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

  .split input {
    background-color: var(--m3c-surface-container-highest);
    border-radius: 1rem;
    padding-inline: 0.5rem;
    padding-block: 0.25rem;
    align-self: stretch;
    border: none;
    color: var(--m3c-on-surface);
    font-size: 0.875rem;
    outline: none;
    min-width: 10rem;
  }
  .split input::placeholder {
    color: var(--m3c-on-surface-variant);
  }
</style>
