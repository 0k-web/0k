import type {
  RawHeaders,
  TransferrableResponse,
  WebSocketDataType,
} from '@mercuryworkshop/proxy-transports';
import {
  ampMagicBytes,
  iceGatherTimeoutMs,
  normalizeRoom,
  toUint8Array,
  waitForIceGathering,
} from '@0k-web/lib';
import { libcurl } from 'libcurl.js';
import libcurlWasmUrl from 'libcurl.js/libcurl.wasm?url';
import type { WebRtcUiState } from './webrtc-state.svelte';
import { getWebRtcState, patchWebRtcState, setWebRtcPhase } from './webrtc-state.svelte';

const defaultIceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];
const gatewayAmpBase =
  'https://gateway-0k--web-workers-dev.cdn.ampproject.org/r/s/gateway.0k-web.workers.dev';
const keepaliveLabel = '0k-keepalive';
const socketChannelPrefix = '0k-socket/';
const libcurlProxyBase = 'wss://webrtc.local/';
const textDecoder = new TextDecoder();

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};
type WebRtcRuntime = {
  promptRequest?: Deferred<void>;
  peerConnection?: RTCPeerConnection;
  keepaliveChannel?: RTCDataChannel;
  keepaliveReady?: Promise<void>;
  preparedOffer?: string;
  preparePromise?: Promise<void>;
  connectPromise?: Promise<void>;
  libcurlReady?: Promise<void>;
  session?: InstanceType<typeof libcurl.HTTPSession>;
  transportConfigured: boolean;
  prepareGeneration: number;
};

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function getRawHeader(headers: RawHeaders, name: string) {
  const lowerName = name.toLowerCase();
  return headers.find(([header]) => header.toLowerCase() === lowerName)?.[1];
}

function shouldPromptForRequest(method: string, headers: RawHeaders) {
  const normalizedMethod = method.toUpperCase();
  const accept = getRawHeader(headers, 'accept')?.toLowerCase() ?? '';
  return (normalizedMethod == 'GET' || normalizedMethod == 'POST') && accept.includes('text/html');
}

async function waitForDataChannelOpen(
  channel: RTCDataChannel,
  peerConnection: RTCPeerConnection,
  signal?: AbortSignal,
) {
  if (channel.readyState === 'open') {
    return;
  }

  if (signal?.aborted) {
    throw abortError();
  }

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onClose = () => {
      cleanup();
      reject(new Error('WebRTC data channel closed before it opened'));
    };

    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    const onStateChange = () => {
      if (
        peerConnection.connectionState === 'failed' ||
        peerConnection.connectionState === 'closed'
      ) {
        cleanup();
        reject(new Error(`Peer connection ${peerConnection.connectionState}`));
      }
    };

    const cleanup = () => {
      channel.removeEventListener('open', onOpen);
      channel.removeEventListener('close', onClose);
      signal?.removeEventListener('abort', onAbort);
      peerConnection.removeEventListener('connectionstatechange', onStateChange);
    };

    channel.addEventListener('open', onOpen, { once: true });
    channel.addEventListener('close', onClose, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    peerConnection.addEventListener('connectionstatechange', onStateChange);
  });
}

async function sendOffer(room: string, offer: string) {
  const url = new URL(`${gatewayAmpBase}/sendOffer`);
  url.searchParams.set('room', room);
  url.searchParams.set('offer', offer);

  const response = await fetch(url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Gateway offer failed: ${response.status} ${await response.text()}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < ampMagicBytes.byteLength) {
    throw new Error('Gateway response was shorter than the AMP prefix');
  }

  return textDecoder.decode(bytes.subarray(ampMagicBytes.byteLength));
}

function parseTransportDestination(url: string) {
  const parsedUrl = new URL(url);
  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  return decodeURIComponent(pathSegments[pathSegments.length - 1] ?? parsedUrl.host);
}

const runtime: WebRtcRuntime = {
  transportConfigured: false,
  prepareGeneration: 0,
};

function connected() {
  return (
    runtime.peerConnection?.connectionState === 'connected' &&
    runtime.keepaliveChannel?.readyState === 'open'
  );
}

function failPhase(message: string, patch: Partial<WebRtcUiState> = {}) {
  setWebRtcPhase('failed', message, {
    ...patch,
    lastError: message,
  });
}

function disposeConnection() {
  runtime.preparedOffer = undefined;
  runtime.keepaliveReady = undefined;
  runtime.keepaliveChannel = undefined;
  if (runtime.session) {
    runtime.session.close();
  }
  runtime.session = undefined;
  if (runtime.peerConnection) {
    try {
      runtime.peerConnection.close();
    } catch {
      // ignore close errors during cleanup
    }
  }
  runtime.peerConnection = undefined;
}

function refreshPassivePhase() {
  getWebRtcState().promptOpen = !!runtime.promptRequest;

  if (runtime.connectPromise) {
    return;
  }

  if (connected()) {
    setWebRtcPhase('connected', 'Tunnel connected and ready for requests.', { connecting: false });
    return;
  }

  if (runtime.promptRequest) {
    setWebRtcPhase(
      'waiting-for-room',
      runtime.preparedOffer
        ? 'Local offer is ready. Enter the tunnel code to connect.'
        : 'Preparing the local offer while you enter the tunnel.',
      { connecting: false },
    );
    return;
  }

  if (runtime.preparedOffer) {
    setWebRtcPhase('offer-ready', 'Local offer is ready before the tunnel room is entered.', {
      connecting: false,
    });
    return;
  }

  setWebRtcPhase('idle', 'Tunnel idle.', { connecting: false });
}

async function prepareOffer(generation: number) {
  setWebRtcPhase('preparing-peer', 'Creating a local peer connection.', { connecting: false });

  const peerConnection = new RTCPeerConnection({ iceServers: defaultIceServers });
  const keepaliveChannel = peerConnection.createDataChannel(keepaliveLabel);
  keepaliveChannel.binaryType = 'arraybuffer';

  runtime.peerConnection = peerConnection;
  runtime.keepaliveChannel = keepaliveChannel;
  runtime.keepaliveReady = waitForDataChannelOpen(keepaliveChannel, peerConnection);

  peerConnection.addEventListener('connectionstatechange', () => {
    if (runtime.peerConnection !== peerConnection) {
      return;
    }

    if (
      peerConnection.connectionState === 'failed' ||
      peerConnection.connectionState === 'disconnected' ||
      peerConnection.connectionState === 'closed'
    ) {
      runtime.prepareGeneration += 1;
      disposeConnection();
      if (runtime.promptRequest) {
        failPhase(`Peer connection ${peerConnection.connectionState}.`, {
          connecting: false,
        });
      } else {
        refreshPassivePhase();
      }
    }
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  setWebRtcPhase(
    'gathering-offer',
    `Gathering ICE candidates for a local offer (up to ${iceGatherTimeoutMs}ms).`,
    { connecting: false },
  );
  await waitForIceGathering(peerConnection, iceGatherTimeoutMs);

  if (generation !== runtime.prepareGeneration || runtime.peerConnection !== peerConnection) {
    return;
  }

  const localDescription = peerConnection.localDescription;
  if (!localDescription) {
    throw new Error('Missing local description after ICE gathering');
  }

  runtime.preparedOffer = JSON.stringify(localDescription);
  refreshPassivePhase();
}

async function ensureLibcurlReady() {
  if (runtime.libcurlReady) {
    return await runtime.libcurlReady;
  }

  const attempt = (async () => {
    await libcurl.load_wasm(libcurlWasmUrl);

    if (!runtime.transportConfigured) {
      libcurl.transport = function WebRtcTransportFactory(url: string) {
        return createDataChannelSocket(parseTransportDestination(url));
      } as unknown as typeof WebSocket;
      libcurl.set_websocket(libcurlProxyBase);
      runtime.transportConfigured = true;
    }
  })();

  runtime.libcurlReady = attempt;
  try {
    await attempt;
  } catch (error) {
    if (runtime.libcurlReady === attempt) {
      runtime.libcurlReady = undefined;
    }
    throw error;
  }
}

export async function initWebRtcTransport() {
  await ensureLibcurlReady();
}

export async function primeWebRtc() {
  void ensureLibcurlReady();

  if (connected() || runtime.preparedOffer) {
    return;
  }

  if (runtime.preparePromise) {
    return await runtime.preparePromise;
  }

  const generation = ++runtime.prepareGeneration;
  disposeConnection();

  const attempt = prepareOffer(generation);
  runtime.preparePromise = attempt;
  try {
    await attempt;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runtime.prepareGeneration += 1;
    disposeConnection();
    failPhase(message, {
      connecting: false,
    });
    throw error;
  } finally {
    if (runtime.preparePromise === attempt) {
      runtime.preparePromise = undefined;
    }
  }
}

export async function ensureConnected(allowPrompt: boolean) {
  if (connected()) {
    return;
  }

  if (runtime.connectPromise) {
    return await runtime.connectPromise;
  }

  if (!allowPrompt) {
    if (runtime.promptRequest) {
      return await runtime.promptRequest.promise;
    }

    throw new Error('WebRTC tunnel is not connected');
  }

  void primeWebRtc();

  if (!runtime.promptRequest) {
    runtime.promptRequest = createDeferred<void>();
    refreshPassivePhase();
  }

  const promptRequest = runtime.promptRequest;
  try {
    await promptRequest.promise;
  } finally {
    if (runtime.promptRequest === promptRequest && !connected()) {
      runtime.promptRequest = undefined;
      refreshPassivePhase();
    }
  }
}

async function openConnection(room: string) {
  await primeWebRtc();

  const peerConnection = runtime.peerConnection;
  const keepaliveReady = runtime.keepaliveReady;
  const preparedOffer = runtime.preparedOffer;
  if (!peerConnection || !keepaliveReady || !preparedOffer) {
    throw new Error('Local offer was not ready');
  }

  setWebRtcPhase(
    'sending-offer',
    'Sending the local offer through the gateway and waiting for the server answer.',
    { connecting: true },
  );

  const answerText = await sendOffer(room, preparedOffer);
  const answer = JSON.parse(answerText);
  if (
    answer &&
    typeof answer === 'object' &&
    'error' in answer &&
    typeof answer.error === 'string'
  ) {
    throw new Error(answer.error);
  }

  setWebRtcPhase('applying-answer', 'Applying the server answer.', { connecting: true });
  await peerConnection.setRemoteDescription(answer);
  setWebRtcPhase('opening-channel', 'Waiting for the keepalive data channel to open.', {
    connecting: true,
  });
  await keepaliveReady;
  runtime.preparedOffer = undefined;
  refreshPassivePhase();
}

export async function submitWebRtcPrompt(roomInput: string) {
  const normalizedRoom = normalizeRoom(roomInput);
  if (!normalizedRoom) {
    failPhase('Tunnel room is required.', {
      connecting: false,
    });
    throw new Error('Tunnel room is required');
  }

  if (connected() && getWebRtcState().room === normalizedRoom) {
    return;
  }

  if (runtime.connectPromise && getWebRtcState().room === normalizedRoom) {
    return await runtime.connectPromise;
  }

  patchWebRtcState({
    room: normalizedRoom,
    lastError: '',
  });
  const attempt = openConnection(normalizedRoom);
  runtime.connectPromise = attempt;
  try {
    await attempt;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runtime.prepareGeneration += 1;
    disposeConnection();
    failPhase(message, {
      connecting: false,
    });
    throw error;
  } finally {
    if (runtime.connectPromise === attempt) {
      runtime.connectPromise = undefined;
    }
  }
}

export function finishWebRtcPromptClose(returnValue: string) {
  const promptRequest = runtime.promptRequest;
  runtime.promptRequest = undefined;

  if (returnValue === 'connected') {
    promptRequest?.resolve();
  } else {
    promptRequest?.reject(new Error('WebRTC tunnel prompt was closed before connecting'));
  }

  refreshPassivePhase();
}

async function openSocketChannel(destination: string, signal?: AbortSignal) {
  await ensureConnected(false);

  const peerConnection = runtime.peerConnection;
  if (!peerConnection || !connected()) {
    throw new Error('WebRTC tunnel is not connected');
  }

  if (signal?.aborted) {
    throw abortError();
  }

  const channel = peerConnection.createDataChannel(`${socketChannelPrefix}${destination}`, {
    ordered: true,
  });
  channel.binaryType = 'arraybuffer';
  await waitForDataChannelOpen(channel, peerConnection, signal);
  return channel;
}

function createDataChannelSocket(destination: string) {
  const socket = new EventTarget() as EventTarget & WebSocket;
  let channel: RTCDataChannel | undefined;
  let closed = false;
  let closeDispatched = false;

  const dispatch = (event: Event) => {
    const handlerName = `on${event.type}` as 'onopen' | 'onclose' | 'onerror' | 'onmessage';
    socket[handlerName]?.(event as never);
    socket.dispatchEvent(event);
  };

  const dispatchClose = () => {
    if (closeDispatched) {
      return;
    }

    closeDispatched = true;
    dispatch(new CloseEvent('close'));
  };

  Object.defineProperties(socket, {
    url: {
      value: `${libcurlProxyBase}${destination}`,
      writable: false,
    },
    CONNECTING: { value: WebSocket.CONNECTING },
    OPEN: { value: WebSocket.OPEN },
    CLOSING: { value: WebSocket.CLOSING },
    CLOSED: { value: WebSocket.CLOSED },
    readyState: {
      get() {
        if (!channel) {
          return closed ? WebSocket.CLOSED : WebSocket.CONNECTING;
        }

        switch (channel.readyState) {
          case 'open':
            return WebSocket.OPEN;
          case 'closing':
            return WebSocket.CLOSING;
          case 'closed':
            return WebSocket.CLOSED;
          default:
            return WebSocket.CONNECTING;
        }
      },
    },
    bufferedAmount: {
      get() {
        return channel?.bufferedAmount ?? 0;
      },
    },
    protocol: { value: '' },
    extensions: { value: '' },
    binaryType: {
      value: 'arraybuffer',
      writable: true,
    },
  });

  socket.onopen = null;
  socket.onclose = null;
  socket.onerror = null;
  socket.onmessage = null;

  socket.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    if (!channel || channel.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }

    if (data instanceof Blob) {
      throw new Error('Blob payloads are not supported by the WebRTC socket transport');
    }

    if (typeof data === 'string') {
      channel.send(data);
      return;
    }

    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      channel.send(toUint8Array(data));
      return;
    }

    throw new Error('Unsupported WebRTC socket payload');
  };

  socket.close = () => {
    closed = true;
    if (channel && channel.readyState !== 'closed') {
      channel.close();
    } else {
      dispatchClose();
    }
  };

  void (async () => {
    try {
      const openedChannel = await openSocketChannel(destination);
      if (closed) {
        openedChannel.close();
        dispatchClose();
        return;
      }

      channel = openedChannel;
      channel.binaryType = 'arraybuffer';
      channel.onopen = () => {
        dispatch(new Event('open'));
      };
      channel.onclose = () => {
        dispatchClose();
      };
      channel.onerror = () => {
        dispatch(new Event('error'));
      };
      channel.onmessage = (event) => {
        dispatch(new MessageEvent('message', { data: event.data }));
      };

      if (channel.readyState === 'open') {
        dispatch(new Event('open'));
      }
    } catch (error) {
      if (!closed) {
        console.error(
          `[WebRTC] Failed to open socket channel for ${destination}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        dispatch(new Event('error'));
      }
      dispatchClose();
    }
  })();

  return socket;
}

function getSession() {
  if (!runtime.session) {
    runtime.session = new libcurl.HTTPSession();
  }

  return runtime.session!;
}

export async function requestOverWebRtc(
  remote: URL,
  method: string,
  body: BodyInit | null,
  headers: RawHeaders,
  signal: AbortSignal | undefined,
) {
  const canPrompt = shouldPromptForRequest(method, headers);
  await ensureLibcurlReady();
  await ensureConnected(canPrompt);

  const requestBody =
    body && method !== 'GET' && method !== 'HEAD'
      ? await new Response(body).arrayBuffer()
      : undefined;
  const response = await getSession().fetch(remote.href, {
    method,
    headers,
    body: requestBody,
    redirect: 'manual',
    signal,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Array.isArray(response.raw_headers) ? response.raw_headers : [...response.headers],
    body: response.body ?? new ArrayBuffer(0),
  } satisfies TransferrableResponse;
}

export function connectOverWebRtc(
  url: URL,
  protocols: string[],
  requestHeaders: RawHeaders,
  onopen: (protocol: string, extensions: string) => void,
  onmessage: (data: WebSocketDataType) => void,
  onclose: (code: number, reason: string) => void,
  onerror: (error: string) => void,
): [(data: WebSocketDataType) => void, (code: number, reason: string) => void] {
  let socket: WebSocket | undefined;
  let closed = false;

  void (async () => {
    try {
      await ensureLibcurlReady();
      await ensureConnected(false);
      if (closed) {
        return;
      }

      socket = new libcurl.WebSocket(url.toString(), protocols, {
        headers: requestHeaders,
      });
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => onopen('', '');
      socket.onclose = (event) => onclose(event.code, event.reason);
      socket.onerror = () => onerror('WebRTC WebSocket transport failed');
      socket.onmessage = (event) => onmessage(event.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onerror(message);
      onclose(1011, message);
    }
  })();

  return [
    (data) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('WebRTC WebSocket is not open');
      }

      if (data instanceof Blob) {
        void data.arrayBuffer().then((buffer) => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(buffer);
          }
        });
        return;
      }

      socket.send(data);
    },
    (code, reason) => {
      closed = true;
      socket?.close(code, reason);
    },
  ];
}
