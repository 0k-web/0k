export type TunnelMode = 'direct' | 'nostr';

type TunnelPhase = 'disconnected' | 'connecting' | 'connected' | 'failed';

export type TunnelUiState = {
  phase: TunnelPhase;
  detail: string;
  host: string;
  mode: TunnelMode;
  code: string;
  lastError: string;
};

const state = $state<TunnelUiState>({
  phase: 'disconnected',
  detail: 'Tunnel disconnected. Configure in settings.',
  host: '216.250.119.217',
  mode: 'direct',
  code: '',
  lastError: '',
});

export const getTunnelState = () => state;

export function patchTunnelState(patch: Partial<TunnelUiState>) {
  Object.assign(state, patch);
}

export function setTunnelPhase(
  phase: TunnelPhase,
  detail: string,
  patch: Partial<TunnelUiState> = {},
) {
  state.phase = phase;
  state.detail = detail;
  if (phase !== 'failed' && !('lastError' in patch)) {
    state.lastError = '';
  }
  Object.assign(state, patch);
}

const NOSTR_CODE_RE = /^[0-9a-fA-F]{4}$/;

export function detectMode(input: string): { mode: TunnelMode; host: string; code: string } {
  const trimmed = input.trim();
  if (NOSTR_CODE_RE.test(trimmed)) {
    return { mode: 'nostr', host: '', code: trimmed.toLowerCase() };
  }
  return { mode: 'direct', host: trimmed || '216.250.119.217', code: '' };
}
