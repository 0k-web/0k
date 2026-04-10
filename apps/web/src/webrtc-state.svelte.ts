type WebRtcPhase =
  | 'idle'
  | 'preparing-peer'
  | 'gathering-offer'
  | 'offer-ready'
  | 'waiting-for-code'
  | 'sending-offer'
  | 'applying-answer'
  | 'opening-channel'
  | 'connected'
  | 'failed';

export type WebRtcUiState = {
  current: WebRtcPhase;
  detail: string;
  connecting: boolean;
  promptOpen: boolean;
  code: string;
  lastError: string;
};

const state = $state<WebRtcUiState>({
  current: 'idle',
  detail: 'Tunnel idle.',
  connecting: false,
  promptOpen: false,
  code: '',
  lastError: '',
});

export const getWebRtcState = () => state;

export function patchWebRtcState(patch: Partial<WebRtcUiState>) {
  Object.assign(state, patch);
}

export function setWebRtcPhase(
  current: WebRtcPhase,
  detail: string,
  patch: Partial<WebRtcUiState> = {},
) {
  state.current = current;
  state.detail = detail;
  if (current !== 'failed' && !('lastError' in patch)) {
    state.lastError = '';
  }
  Object.assign(state, patch);
}
