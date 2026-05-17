import type {
  RawHeaders,
  TransferrableResponse,
  WebSocketDataType,
} from '@mercuryworkshop/proxy-transports';
import {
  connectDirect,
  connectNostr,
  libcurlTransport,
  type PulsarClientConnection,
} from '@abndnce/pulsar-client';
import { libcurl } from 'libcurl.js';
import libcurlWasmUrl from 'libcurl.js/libcurl.wasm?url';
import { getTunnelState, patchTunnelState, setTunnelPhase, detectMode } from './tunnel-state.svelte';

export const TUNNEL_PORT = 4393;
export const DEFAULT_TUNNEL_HOST = '216.250.119.217';

type TunnelRuntime = {
  connection?: PulsarClientConnection;
  libcurlReady?: Promise<void>;
  session?: InstanceType<typeof libcurl.HTTPSession>;
  transportConfigured: boolean;
  connectPromise?: Promise<void>;
};

const runtime: TunnelRuntime = {
  transportConfigured: false,
};

function connected() {
  return (
    runtime.connection?.pc.connectionState === 'connected' &&
    runtime.connection?.keepalive.readyState === 'open'
  );
}

function disposeConnection() {
  if (runtime.connection) {
    runtime.connection.close().catch(() => {});
  }
  runtime.connection = undefined;
  runtime.transportConfigured = false;
  if (runtime.session) {
    runtime.session.close();
  }
  runtime.session = undefined;
}

async function connectTunnelInner(input: string) {
  const { mode, host, code } = detectMode(input);

  if (mode === 'direct') {
    setTunnelPhase('connecting', `Connecting to tunnel at ${host}:${TUNNEL_PORT}...`);
  } else {
    setTunnelPhase('connecting', `Looking up tunnel code "${code}" via Nostr...`);
  }

  disposeConnection();

  const connection =
    mode === 'direct'
      ? await connectDirect(host, TUNNEL_PORT)
      : await connectNostr(code);

  runtime.connection = connection;
  patchTunnelState({ mode, host, code });

  connection.pc.addEventListener('connectionstatechange', () => {
    if (runtime.connection !== connection) return;
    if (['failed', 'disconnected', 'closed'].includes(connection.pc.connectionState)) {
      disposeConnection();
      setTunnelPhase('disconnected', 'Tunnel connection lost.', { lastError: 'Connection lost' });
    }
  });

  if (mode === 'direct') {
    setTunnelPhase('connected', `Tunnel connected to ${host}:${TUNNEL_PORT}.`);
  } else {
    setTunnelPhase('connected', `Tunnel connected via Nostr (code: ${code}).`);
  }
}

export async function connectTunnel(input: string) {
  const { mode, host, code } = detectMode(input);

  if (connected() && runtime.connection) {
    const state = getTunnelState();
    if (state.mode === mode && (mode === 'nostr' ? state.code === code : state.host === host)) {
      return;
    }
  }

  if (runtime.connectPromise) {
    const state = getTunnelState();
    if (state.mode === mode && (mode === 'nostr' ? state.code === code : state.host === host)) {
      return await runtime.connectPromise;
    }
  }

  patchTunnelState({ host, code, mode, lastError: '' });
  const attempt = connectTunnelInner(input);
  runtime.connectPromise = attempt;
  try {
    await attempt;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    disposeConnection();
    setTunnelPhase('failed', message, { lastError: message });
    throw error;
  } finally {
    if (runtime.connectPromise === attempt) {
      runtime.connectPromise = undefined;
    }
  }
}

export async function disconnectTunnel() {
  disposeConnection();
  setTunnelPhase('disconnected', 'Tunnel disconnected.');
}

async function ensureLibcurlReady() {
  if (runtime.libcurlReady) {
    return await runtime.libcurlReady;
  }

  const attempt = (async () => {
    await libcurl.load_wasm(libcurlWasmUrl);
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

export async function initTunnelTransport() {
  await ensureLibcurlReady();
}

function ensureTransportConfigured() {
  if (runtime.transportConfigured) return;
  if (!runtime.connection) throw new Error('Tunnel is not connected');

  const factory = libcurlTransport(runtime.connection.pc);
  libcurl.transport = function (url: string) {
    return factory(url);
  } as unknown as typeof WebSocket;
  libcurl.set_websocket('wss://pulsar-tunnel.local/');
  runtime.transportConfigured = true;
}

function getSession() {
  if (!runtime.session) {
    runtime.session = new libcurl.HTTPSession();
  }
  return runtime.session!;
}

export async function requestOverTunnel(
  remote: URL,
  method: string,
  body: BodyInit | null,
  headers: RawHeaders,
  signal: AbortSignal | undefined,
) {
  await ensureLibcurlReady();
  if (!connected()) {
    throw new Error('Tunnel is not connected');
  }
  ensureTransportConfigured();

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

export function connectOverTunnel(
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
      if (!connected()) {
        throw new Error('Tunnel is not connected');
      }
      ensureTransportConfigured();
      if (closed) return;

      socket = new libcurl.WebSocket(url.toString(), protocols, {
        headers: requestHeaders,
      });
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => onopen('', '');
      socket.onclose = (event) => onclose(event.code, event.reason);
      socket.onerror = () => onerror('Tunnel WebSocket transport failed');
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
        throw new Error('Tunnel WebSocket is not open');
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
