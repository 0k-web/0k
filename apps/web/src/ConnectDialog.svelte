<script lang="ts">
  import codehsScript from './assets/codehs-script.js?raw';
  import { finishWebRtcPromptClose, submitWebRtcPrompt } from './webrtc';
  import { getWebRtcState } from './webrtc-state.svelte';

  const webrtc = getWebRtcState();

  let dialog = $state<HTMLDialogElement | undefined>();
  let input = $state<HTMLInputElement | undefined>();
  let code = $state(webrtc.code);

  const buttonLabel = $derived.by(() => {
    if (!webrtc.connecting) {
      return 'Connect';
    }

    switch (webrtc.current) {
      case 'preparing-peer':
        return 'Creating peer...';
      case 'gathering-offer':
        return 'Gathering offer...';
      case 'sending-offer':
        return 'Sending offer...';
      case 'applying-answer':
        return 'Applying answer...';
      case 'opening-channel':
        return 'Opening channel...';
      default:
        return 'Connecting...';
    }
  });

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    try {
      await submitWebRtcPrompt(code.trim());
      dialog?.close('connected');
    } catch {
      input?.focus();
      input?.select();
    }
  };
</script>

<dialog
  bind:this={dialog}
  closedby={webrtc.connecting ? 'none' : 'any'}
  ontoggle={(event) => {
    if (event.newState == 'closed') {
      finishWebRtcPromptClose(dialog?.returnValue ?? '');
    }
  }}
  {@attach (node) => {
    node.showModal();
    input?.focus();
    input?.select();
  }}
>
  <form method="dialog" onsubmit={submit}>
    <div class="input-wrap">
      <input
        bind:this={input}
        bind:value={code}
        type="text"
        name="code"
        placeholder="Tunnel code"
        autocomplete="off"
        spellcheck="false"
        disabled={webrtc.connecting}
      />
      <button type="submit" class="connect" disabled={webrtc.connecting}>{buttonLabel}</button>
    </div>
  </form>
  <div class="below">
    {#if webrtc.lastError}
      <p class="error">{webrtc.lastError}</p>
    {:else}
      <small>{webrtc.detail}</small>
    {/if}
  </div>
  <div class="instructions">
    <p class="title">How to start a tunnel</p>

    <p class="option">Standalone (home PC / Codespaces)</p>
    <p>
      Download and run the tunnel executable for your operating system from
      <a href="https://github.com/0k-web/0k/releases/tag/latest">GitHub Releases</a>. Or just run
      <code>npx @0k-web/server</code>.
    </p>

    <p class="option">CodeHS</p>
    <p>
      Create a <a href="https://codehs.com/sandbox" target="_blank"
        >CodeHS "JavaScript Console" sandbox</a
      >, click
      <button onclick={() => navigator.clipboard.writeText(codehsScript)}>here</button> to copy, then
      paste and run.
    </p>

    <p class="option">Server</p>
    <p>
      Learn how to run a dedicated 0K tunnel <a
        href="https://github.com/0k-web/0k/blob/main/dedicated-tunnel.md"
        target="_blank">here</a
      >.
    </p>

    <p class="option">Personal browser relay</p>
    <p>
      Keep
      <code>RELAY_URL_TODO</code>
      open on a personal device.
    </p>
  </div>
</dialog>

<style>
  dialog {
    background: none;
    border: none;
    padding: 0;
    width: min(25rem, calc(100vw - 2rem));
    margin: auto;
    overflow: visible;
    position: fixed;
    inset: 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 150ms,
      visibility 150ms;
  }
  dialog[open] {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    animation: formIn 400ms cubic-bezier(0.05, 0.7, 0.1, 1);
  }
  dialog::backdrop {
    background-color: oklch(from var(--m3c-scrim) l c h / 0.55);
    animation: backdropIn 300ms ease;
  }

  form {
    display: flex;
    flex-direction: column;
  }

  .input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  input {
    width: 100%;
    padding: 1rem 8rem 1rem 1rem;
    outline: none;
    border-radius: 1rem;
    border: none;
    background: var(--m3c-surface-container-high);
    color: var(--m3c-on-surface);
    font-size: 1rem;
    box-sizing: border-box;
  }
  input::placeholder {
    color: var(--m3c-on-surface-variant);
  }

  .connect {
    position: absolute;
    right: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: none;
    background: var(--m3c-primary);
    color: var(--m3c-on-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .connect:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .below {
    text-align: center;
    min-height: 1rem;
    margin-top: 0.625rem;
    padding-inline: 0.25rem;
    font-size: 0.8rem;
    line-height: 1;
  }
  small {
    color: rgba(255, 255, 255, 0.7);
  }
  .error {
    margin: 0;
    font-size: 0.8rem;
    color: var(--m3c-error);
  }

  @keyframes formIn {
    from {
      transform: translateY(-0.5rem);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  @keyframes backdropIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .instructions {
    margin-top: 2rem;
    max-height: 10rem;
    overflow: auto;
    padding: 1rem;
    border-radius: 1rem;
    background: var(--m3c-surface-container-low);
    font-size: 0.825rem;
    color: var(--m3c-on-surface-variant);
  }
  .title,
  .option {
    font-weight: 600;
    color: var(--m3c-on-surface);
  }
  .instructions .option {
    margin-top: 1rem;
  }
  .instructions a,
  .instructions button {
    color: var(--m3c-primary);
    text-decoration: underline;
    cursor: pointer;
  }
  .instructions code {
    background: var(--m3c-surface-container-highest);
    padding: 0 0.25em;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }
</style>
