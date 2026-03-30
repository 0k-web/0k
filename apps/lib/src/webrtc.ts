export const iceGatherTimeoutMs = 1200;

type IceGatheringPeerConnection = {
  iceGatheringState: string;
  connectionState: string;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

export async function waitForIceGathering(
  pc: IceGatheringPeerConnection,
  timeoutMs = iceGatherTimeoutMs,
) {
  if (pc.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      pc.removeEventListener('icecandidate', onCandidate);
      pc.removeEventListener('connectionstatechange', onFailure);
    };

    const timeout = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };

    const onCandidate = (event: Event) => {
      const candidate = (event as { candidate?: unknown }).candidate;
      if (!candidate) {
        cleanup();
        resolve();
      }
    };

    const onFailure = () => {
      if (pc.connectionState === 'failed') {
        cleanup();
        reject(new Error('ICE gathering failed'));
      }
    };

    pc.addEventListener('icegatheringstatechange', onStateChange);
    pc.addEventListener('icecandidate', onCandidate);
    pc.addEventListener('connectionstatechange', onFailure);
  });
}
