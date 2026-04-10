<script lang="ts">
  import { setUpdateCallback, startRelay, shutdown } from './relay';

  type RelayPhase =
    | 'idle'
    | 'connecting-wisp'
    | 'connecting-gateway'
    | 'waiting-for-offers'
    | 'connected'
    | 'failed';

  let wispUrl = $state('');
  let lastError = $state('');
  let phase: RelayPhase = $state('idle');
  let detail = $state('');
  let resolvedCode = $state('');

  setUpdateCallback((update) => {
    phase = update.phase as RelayPhase;
    detail = update.detail;
  });

  const phaseLabel: Record<RelayPhase, string> = {
    idle: '',
    'connecting-wisp': 'Connecting to wisp server\u2026',
    'connecting-gateway': 'Connecting to gateway\u2026',
    'waiting-for-offers': 'Waiting for offers\u2026',
    connected: 'Connected',
    failed: 'Failed',
  };

  async function handleConnect() {
    lastError = '';
    phase = 'connecting-wisp';
    detail = '';

    try {
      const result = await startRelay(wispUrl);
      resolvedCode = result.code;
      phase = 'connected';
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      phase = 'failed';
    }
  }

  function handleDisconnect() {
    shutdown();
    phase = 'idle';
    detail = '';
    lastError = '';
  }
</script>

<main>
  {#if phase === 'idle' || phase === 'failed'}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        handleConnect();
      }}
    >
      <div class="input-wrap">
        <input
          type="url"
          bind:value={wispUrl}
          placeholder="Wisp server URL (eg wss://anura.pro)"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <button type="submit" class="connect">Connect</button>
      </div>
    </form>
    {#if lastError}
      <div class="below">
        <p class="error">{lastError}</p>
      </div>
    {/if}
  {:else}
    <div class="connected-grid">
      <div class="grid-code">Tunnel code: <strong>{resolvedCode}</strong></div>
      <div class="grid-detail">{detail || phaseLabel[phase]}</div>
      <button class="disconnect" onclick={handleDisconnect}>Disconnect</button>
    </div>
  {/if}
</main>

<p class="disclaimer">
  It's inconsiderate to substantively use someone else's Wisp server without getting permission.
</p>

<style>
  main {
    width: min(28rem, calc(100vw - 2rem));
    margin: auto;
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
    padding: 1rem 7rem 1rem 1rem;
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

  .below {
    text-align: center;
    min-height: 1rem;
    margin-top: 0.625rem;
    padding-inline: 0.25rem;
    font-size: 0.8rem;
    line-height: 1;
  }

  .error {
    margin: 0;
    color: var(--m3c-error);
  }

  .connected-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 0.5rem;
    align-items: center;
  }

  .grid-code {
    grid-column: 1 / -1;
    background: var(--m3c-surface-container-high);
    border-radius: 0.5rem;
    padding: 1rem;
    color: var(--m3c-on-surface);
    font-size: 1.25rem;
    box-sizing: border-box;
  }

  .grid-detail {
    background: var(--m3c-surface-container-high);
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    color: var(--m3c-on-surface-variant);
    font-size: 0.8rem;
    box-sizing: border-box;
  }

  .disconnect {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: none;
    background: var(--m3c-error-container);
    color: var(--m3c-on-error-container);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .disclaimer {
    color: var(--m3c-on-surface-variant);
    font-size: 0.8rem;
    margin-top: 1rem;
    line-height: 1.4;
    text-align: center;
  }
</style>
