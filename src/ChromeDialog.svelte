<script lang="ts">
  let { close }: { close: () => void } = $props();
</script>

<dialog
  closedby="any"
  ontoggle={(e) => {
    if (e.newState == 'closed') close();
  }}
  {@attach (node) => node.showModal()}
>
  <p>Are you sure you want to use 0K in this browser? It works best in Chrome.</p>
  <form method="dialog"><button>Continue anyway</button></form>
</dialog>

<style>
  dialog {
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    border-radius: 1rem;
    gap: 1rem;

    inset: 0;
    margin: auto;
    text-align: center;
    background-color: var(--m3c-surface-container-highest);
    color: var(--m3c-on-surface);
    max-width: 25rem;
  }
  dialog::backdrop {
    background-color: oklch(from var(--m3c-scrim) l c h / 0.5);
  }
  form {
    display: contents;
  }
  button {
    display: flex;
    align-items: center;
    height: 2.5rem;
    padding-inline: 1rem;
    border-radius: 1.25rem;
    background-color: var(--m3c-primary);
    color: var(--m3c-on-primary);
    margin-inline: auto;
  }
</style>
