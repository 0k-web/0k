<script lang="ts">
  let { url, go }: { url: string; go: (url: string) => void } = $props();
</script>

<div class="controls">
  <input
    type="url"
    autocomplete="off"
    spellcheck="false"
    value={url}
    onkeypress={(e) => {
      if (e.key == 'Enter') {
        go(e.currentTarget.value);
      }
    }}
  />
</div>

<style>
  .controls {
    position: fixed;
    bottom: 0;
    left: 50%;
    translate: -50% 0;
    min-width: 1rem;
    height: 2rem;

    display: flex;
    background-color: var(--m3c-surface-container-low);
    transition: height var(--transition);

    border-start-start-radius: 0.25rem;
    border-start-end-radius: 0.25rem;
    overflow: hidden;

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
</style>
