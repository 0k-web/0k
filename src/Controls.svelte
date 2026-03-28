<script lang="ts">
  import { untrack } from 'svelte';

  let { url, go }: { url: string; go: (url: string) => void } = $props();

  const history: string[] = $state([]);
  let oldUrl = '';
  const updateFirstLast = (url: string) => {
    if (history.includes(url)) {
      return;
    }

    const oldIndex = history.indexOf(oldUrl);
    history.splice(oldIndex + 1);
    history.push(url);

    if (history.length > 4) {
      history.splice(0, history.length - 4);
    }
  };

  $effect(() => {
    if (!url) return;
    untrack(() => {
      updateFirstLast(url);
      oldUrl = url;
    });
  });

  let urlIndex = $derived(history.indexOf(url));
</script>

<div class="controls">
  <input
    type="url"
    autocomplete="off"
    spellcheck="false"
    placeholder="URL"
    value={url}
    onkeypress={(e) => {
      if (e.key == 'Enter') {
        go(e.currentTarget.value);
      }
    }}
  />
  <div class="history" popover="manual" {@attach (node) => node.showPopover()}>
    {#each history as entry, i}
      {@const entryURL = new URL(entry)}
      {@const entrySimple =
        entryURL.hostname +
        (entryURL.pathname != '/' ? entryURL.pathname : '') +
        entryURL.search +
        entryURL.hash}
      <button
        onclick={() => {
          go(entry);
        }}
      >
        {entrySimple.length > 80 ? `${entrySimple.slice(0, 80)}...` : entrySimple}
        {#if i == urlIndex}
          <svg width="20" height="20" viewBox="0 0 24 24"
            ><path
              fill="currentColor"
              d="M12 20q-3.35 0-5.675-2.325T4 12t2.325-5.675T12 4q1.725 0 3.3.712T18 6.75V5q0-.425.288-.712T19 4t.713.288T20 5v5q0 .425-.288.713T19 11h-5q-.425 0-.712-.288T13 10t.288-.712T14 9h3.2q-.8-1.4-2.187-2.2T12 6Q9.5 6 7.75 7.75T6 12t1.75 4.25T12 18q1.7 0 3.113-.862t2.187-2.313q.2-.35.563-.487t.737-.013q.4.125.575.525t-.025.75q-1.025 2-2.925 3.2T12 20"
            /></svg
          >
        {:else if i < urlIndex}
          <svg width="20" height="20" viewBox="0 0 24 24"
            ><path
              fill="currentColor"
              d="m7.825 13l4.9 4.9q.3.3.288.7t-.313.7q-.3.275-.7.288t-.7-.288l-6.6-6.6q-.15-.15-.213-.325T4.426 12t.063-.375t.212-.325l6.6-6.6q.275-.275.688-.275t.712.275q.3.3.3.713t-.3.712L7.825 11H19q.425 0 .713.288T20 12t-.288.713T19 13z"
            /></svg
          >
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24"
            ><path
              fill="currentColor"
              d="M16.175 13H5q-.425 0-.712-.288T4 12t.288-.712T5 11h11.175l-4.9-4.9q-.3-.3-.288-.7t.313-.7q.3-.275.7-.288t.7.288l6.6 6.6q.15.15.213.325t.062.375t-.062.375t-.213.325l-6.6 6.6q-.275.275-.687.275T11.3 19.3q-.3-.3-.3-.712t.3-.713z"
            /></svg
          >
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .controls {
    position: fixed;
    bottom: 0;
    left: 50%;
    translate: -50% 0;
    min-width: 1rem;
    height: 2rem;
    border-start-start-radius: 0.5rem;
    border-start-end-radius: 0.5rem;

    display: flex;
    background-color: var(--m3c-surface-container-low);
    transition:
      height var(--transition),
      border-radius var(--transition);

    overflow: hidden;
    anchor-name: --controls;

    --transition: linear(
        0,
        0.01 3.2%,
        0.03,
        0.06,
        0.11,
        0.19 13.3%,
        0.25,
        0.32,
        0.43,
        0.53,
        0.61 19.3%,
        0.69,
        0.74,
        0.78,
        0.81 27.2%,
        0.88,
        0.92 40.6%,
        0.964 55%,
        0.994,
        1
      )
      400ms;
  }
  .controls::after {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    content: '⋯';
    transition:
      opacity var(--transition),
      translate var(--transition);
  }
  input {
    field-sizing: content;
    outline: none;
    padding-inline: 0.5rem;
    transition:
      width var(--transition),
      padding var(--transition),
      visibility allow-discrete var(--transition);
  }

  .controls:not(:hover, :focus-within) {
    height: 0.5rem;
    border-start-start-radius: 0.25rem;
    border-start-end-radius: 0.25rem;
  }
  .controls:is(:hover, :focus-within)::after {
    translate: -50% -200%;
    opacity: 0;
    visibility: hidden;
  }
  .controls:not(:hover, :focus-within) > input {
    width: 0;
    padding-inline: 0;
    visibility: hidden;
  }
  .controls:not(:hover, :focus-within) > .history {
    width: 0;
    height: 0;
    visibility: hidden;
  }

  .history {
    position: absolute;
    position-anchor: --controls;

    justify-self: center;
    align-self: end;
    bottom: anchor(--controls top);
    margin-bottom: 0.25rem;

    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: center;
    overflow: hidden;

    border-radius: var(--radius);
    background-color: transparent;
    pointer-events: none;
    transition:
      width var(--transition),
      height var(--transition),
      visibility var(--transition);

    --radius: 1rem;
  }
  .history > button {
    display: flex;
    align-items: center;
    height: 2rem;
    border-radius: var(--radius);
    white-space: nowrap;

    padding-inline-start: 0.5rem;
    background-color: var(--m3c-primary-container-subtle);
    color: var(--m3c-on-primary-container-subtle);
    pointer-events: auto;
  }
  .history > button > svg {
    margin-inline-start: 0.25rem;
    margin-inline-end: 0.375rem;
  }
</style>
