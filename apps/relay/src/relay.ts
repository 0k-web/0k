import {
  codeFromProof,
  createRandomProof,
  iceGatherTimeoutMs,
  toUint8Array,
  waitForIceGathering,
} from '@0k-web/lib';
import { WispClient } from './wisp-client';

const gatewayOrigin = 'https://gateway.0k-web.workers.dev';
const defaultIceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];
const keepaliveLabel = '0k-keepalive';
const socketChannelPrefix = '0k-socket/';

const peerConnections = new Set<RTCPeerConnection>();
let wispClient: WispClient | undefined;
let shuttingDown = false;

type SessionDescription = { type: 'offer' | 'answer'; sdp: string };
type UpdateCallback = (update: { phase: string; detail: string }) => void;

let onUpdate: UpdateCallback = () => {};

export function setUpdateCallback(cb: UpdateCallback) {
  onUpdate = cb;
}

function update(phase: string, detail: string) {
  onUpdate({ phase, detail });
}

function decodeOfferPayload(payload: string) {
  const offerKey: unknown = JSON.parse(payload);
  if (typeof offerKey !== 'string')
    throw new Error('Offer payload was not a gateway-framed RTC offer');
  const sd: unknown = JSON.parse(offerKey);
  if (
    !sd ||
    typeof sd !== 'object' ||
    !('type' in sd) ||
    !('sdp' in sd) ||
    (sd.type !== 'offer' && sd.type !== 'answer') ||
    typeof sd.sdp !== 'string'
  )
    throw new Error('Offer payload was not a valid RTCSessionDescriptionInit');
  return {
    offerKey,
    sessionDescription: { type: (sd as SessionDescription).type, sdp: (sd as { sdp: string }).sdp },
  };
}

function parseDestination(label: string) {
  if (!label.startsWith(socketChannelPrefix)) throw new Error(`Unknown channel label "${label}"`);
  const dest = label.slice(socketChannelPrefix.length);
  if (!dest) throw new Error('Socket destination missing');

  if (dest.startsWith('[')) {
    const cb = dest.indexOf(']');
    if (cb === -1 || dest[cb + 1] !== ':') throw new Error(`Invalid IPv6 destination "${dest}"`);
    const hostname = dest.slice(1, cb);
    const port = Number(dest.slice(cb + 2));
    if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error(`Invalid IPv6 destination "${dest}"`);
    return { hostname, port };
  }

  const sep = dest.lastIndexOf(':');
  if (sep === -1) throw new Error(`Invalid destination "${dest}"`);
  const hostname = dest.slice(0, sep);
  const port = Number(dest.slice(sep + 1));
  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid destination "${dest}"`);
  return { hostname, port };
}

function handleSocketChannel(channel: RTCDataChannel) {
  const { hostname, port } = parseDestination(channel.label);
  if (!wispClient) {
    channel.close();
    return;
  }

  channel.binaryType = 'arraybuffer';
  let stream;
  try {
    stream = wispClient.connect(hostname, port);
  } catch {
    channel.close();
    return;
  }

  stream.ondata = (data) => {
    if (channel.readyState === 'open') channel.send(data);
  };
  stream.onclose = () => {
    if (channel.readyState === 'open') channel.close();
  };

  channel.onmessage = (event) => {
    stream!.sendToStream(toUint8Array(event.data));
  };
  channel.onclose = () => stream!.close(0x02);
  channel.onerror = () => stream!.close(0x03);
}

function handleDataChannel(channel: RTCDataChannel) {
  channel.binaryType = 'arraybuffer';
  if (channel.label === keepaliveLabel) return;
  try {
    handleSocketChannel(channel);
  } catch {
    channel.close();
  }
}

async function handleOffer(offer: SessionDescription): Promise<string> {
  const pc = new RTCPeerConnection({ iceServers: defaultIceServers });
  peerConnections.add(pc);

  pc.addEventListener('connectionstatechange', () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      peerConnections.delete(pc);
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
  });
  pc.ondatachannel = (event) => handleDataChannel(event.channel);

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc, iceGatherTimeoutMs);

  const localDescription = pc.localDescription;
  if (!localDescription) throw new Error('Missing local description after ICE gathering');
  return JSON.stringify(localDescription);
}

async function processOffer(code: string, proof: string, offer: string) {
  try {
    const decoded = decodeOfferPayload(offer);
    const answer = await handleOffer(decoded.sessionDescription);
    const url = new URL('/acceptOffer', gatewayOrigin);
    url.searchParams.set('code', code);
    url.searchParams.set('proof', proof);
    url.searchParams.set('offer', decoded.offerKey);
    url.searchParams.set('answer', answer);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gateway rejected answer (${res.status} ${res.statusText})`);
    update('connected', 'Accepted an offer');
  } catch (e) {
    console.error(`Failed to handle offer:`, e);
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function lookForOffers(code: string, proof: string) {
  while (!shuttingDown) {
    try {
      const url = new URL('/lookForOffers', gatewayOrigin);
      url.searchParams.set('code', code);
      url.searchParams.set('proof', proof);
      const res = await fetch(url, { headers: { accept: 'text/plain' } });
      if (!res.ok || !res.body) throw new Error(`Gateway returned ${res.status} ${res.statusText}`);

      update('connected', `Connected to gateway for tunnel code "${code}"`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!shuttingDown) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) void processOffer(code, proof, line);
        }
      }

      if (!shuttingDown) {
        update('connected', 'Offer stream closed. Reconnecting...');
      }
    } catch (e) {
      if (shuttingDown) break;
      console.error('Offer loop error:', e);
      update('connected', 'Connection error. Reconnecting...');
      await delay(2000);
    }
  }
}

export function shutdown() {
  shuttingDown = true;
  for (const pc of peerConnections)
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  peerConnections.clear();
  wispClient?.close();
  wispClient = undefined;
}

export async function startRelay(wispUrl: string) {
  shuttingDown = false;

  // Connect to wisp server
  update('connecting-wisp', 'Connecting to wisp server...');
  const wisp = new WispClient(wispUrl);
  wispClient = wisp;
  wisp.onclose = () => {
    if (!shuttingDown) {
      update('failed', 'Wisp server disconnected');
    }
  };

  try {
    await wisp.connected;
  } catch (e) {
    shutdown();
    throw new Error(`Failed to connect to wisp server: ${e instanceof Error ? e.message : String(e)}`);
  }

  const proof = createRandomProof();
  const code = await codeFromProof(proof);

  update('connecting-gateway', `Connecting to gateway for tunnel code "${code}"...`);

  // Start looking for offers
  void lookForOffers(code, proof);

  return { code, proof };
}
