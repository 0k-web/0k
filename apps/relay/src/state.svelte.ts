export type RelayPhase =
  | 'idle'
  | 'connecting-wisp'
  | 'connecting-gateway'
  | 'waiting-for-offers'
  | 'connected'
  | 'failed';

interface RelayState {
  phase: RelayPhase;
  detail: string;
  wispUrl: string;
  lastError: string;
  resolvedCode: string;
  resolvedProof: string;
}

function createInitialState(): RelayState {
  return {
    phase: 'idle',
    detail: '',
    wispUrl: '',
    lastError: '',
    resolvedCode: '',
    resolvedProof: '',
  };
}

const state = $state<RelayState>(createInitialState());

export function getRelayState(): RelayState {
  return state;
}

export function patchRelayState(patch: Partial<RelayState>) {
  Object.assign(state, patch);
}

export function setRelayPhase(phase: RelayPhase) {
  state.phase = phase;
}

export function resetRelayState() {
  const initial = createInitialState();
  // Preserve form inputs
  initial.wispUrl = state.wispUrl;
  Object.assign(state, initial);
}
