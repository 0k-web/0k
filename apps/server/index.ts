import { Buffer } from 'node:buffer';
import { type RTCDataChannel, RTCPeerConnection } from 'werift';
import {
  createRandomProof,
  iceGatherTimeoutMs,
  isDomainCode,
  normalizeCode,
  codeFromProof,
  sha256HexFromText,
  toUint8Array,
  waitForIceGathering,
} from '../lib/src/index.ts';

const gatewayOrigin = 'https://gateway.0k-web.workers.dev';
const defaultIceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];
const keepaliveLabel = '0k-keepalive';
const socketChannelPrefix = '0k-socket/';
const peerConnections = new Map<number, RTCPeerConnection>();

let connectionIdCounter = 0;
let shuttingDown = false;

type SessionDescription = { type: 'offer' | 'answer'; sdp: string };
type CliOptions = { help: boolean; proof?: string; code?: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function writeAll(conn: Deno.Conn, bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.byteLength) offset += await conn.write(bytes.subarray(offset));
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = { help: false };
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--proof' || arg === '--code') {
      const value = args[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === '--proof') options.proof = value;
      else options.code = value;
      continue;
    }
    positional.push(arg);
  }

  if (!options.proof && positional.length > 0) {
    if (!options.code && positional.length === 1 && isDomainCode(positional[0]!)) {
      options.code = positional[0]!;
    } else {
      options.proof = positional[0]!;
      if (!options.code && positional[1]) options.code = positional[1];
    }
  }

  return options;
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
  let socket: Deno.Conn | undefined;
  let closed = false;
  const pendingWrites: Uint8Array[] = [];
  let writeChain = Promise.resolve();

  const closeSocket = () => {
    if (closed) return;
    closed = true;
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };

  const closeChannel = () => {
    if (channel.readyState === 'open')
      try {
        channel.close();
      } catch {
        /* ignore */
      }
  };

  const queueWrite = (chunk: Uint8Array) => {
    if (!socket) {
      pendingWrites.push(chunk);
      return;
    }
    writeChain = writeChain
      .then(async () => {
        if (!closed && socket) await writeAll(socket, chunk);
      })
      .catch((e) => {
        console.error(`[Socket] Write failed for ${hostname}:${port}: ${errMsg(e)}`);
        closeSocket();
        closeChannel();
      });
  };

  channel.onmessage = (event) => {
    try {
      queueWrite(toUint8Array(event.data));
    } catch (e) {
      console.error(`[Socket] Invalid payload for ${hostname}:${port}: ${errMsg(e)}`);
      closeSocket();
      closeChannel();
    }
  };
  channel.onclose = () => closeSocket();
  channel.onerror = (event) => {
    console.error(`[Socket] Channel error for ${hostname}:${port}: ${String(event.error)}`);
    closeSocket();
  };

  void (async () => {
    try {
      socket = await Deno.connect({ hostname, port, transport: 'tcp' });
      for (const chunk of pendingWrites.splice(0)) queueWrite(chunk);
      const buf = new Uint8Array(16 * 1024);
      while (!closed) {
        const read = await socket.read(buf);
        if (read === null) break;
        if (read > 0 && channel.readyState === 'open')
          channel.send(Buffer.from(buf.subarray(0, read)));
      }
    } catch (e) {
      console.error(`[Socket] Failed to connect to ${hostname}:${port}: ${errMsg(e)}`);
    } finally {
      closeSocket();
      closeChannel();
    }
  })();
}

function handleDataChannel(channel: RTCDataChannel) {
  if ('binaryType' in channel) channel.binaryType = 'arraybuffer';
  if (channel.label === keepaliveLabel) return;
  try {
    handleSocketChannel(channel);
  } catch (e) {
    console.error(`[DataChannel] Failed to handle "${channel.label}": ${errMsg(e)}`);
    channel.close();
  }
}

async function handleOffer(offer: SessionDescription) {
  const connectionId = ++connectionIdCounter;
  const pc = new RTCPeerConnection({ iceServers: defaultIceServers });
  peerConnections.set(connectionId, pc);

  pc.addEventListener('connectionstatechange', () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      peerConnections.delete(connectionId);
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
    console.log('[Gateway] Accepted an offer.');
  } catch (e) {
    console.error(`[Gateway] Failed to handle offer: ${errMsg(e)}`);
  }
}

async function* readLines(stream: ReadableStream<Uint8Array>) {
  let buffer = '';
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield line;
    }
  }
  const trailing = buffer.trim();
  if (trailing) yield trailing;
}

async function lookForOffers(code: string, proof: string) {
  while (!shuttingDown) {
    try {
      const url = new URL('/lookForOffers', gatewayOrigin);
      url.searchParams.set('code', code);
      url.searchParams.set('proof', proof);
      const res = await fetch(url, { headers: { accept: 'text/plain' } });
      if (!res.ok || !res.body) throw new Error(`Gateway returned ${res.status} ${res.statusText}`);
      console.log(`[Gateway] Connected to ${url.origin} for tunnel code "${code}".`);
      for await (const offer of readLines(res.body)) void processOffer(code, proof, offer);
      if (!shuttingDown) console.warn('[Gateway] Offer stream closed. Reconnecting.');
    } catch (e) {
      if (shuttingDown) break;
      console.error(`[Gateway] Offer loop error: ${errMsg(e)}`);
      await delay(1000);
    }
  }
}

function shutdown() {
  shuttingDown = true;
  for (const pc of peerConnections.values())
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  peerConnections.clear();
}

// --- Relaunch in a terminal if double-clicked without one ---

if (!Deno.isatty(Deno.stdout.rid)) {
  const exec = Deno.execPath();
  const terms: [string, string[]][] = [
    ['ptyxis', ['-e', exec, ...Deno.args]],
    ['gnome-terminal', ['--', exec, ...Deno.args]],
    ['konsole', ['-e', exec, ...Deno.args]],
    ['xfce4-terminal', ['-e', exec, ...Deno.args]],
    ['xterm', ['-e', exec, ...Deno.args]],
    ['open', ['-a', 'Terminal', exec, ...Deno.args]],
  ];
  for (const [cmd, args] of terms) {
    try {
      const check = new Deno.Command('which', { args: [cmd] }).outputSync();
      if (check.success) {
        new Deno.Command(cmd, { args, cwd: Deno.cwd() }).spawn();
        Deno.exit(0);
      }
    } catch {
      /* next */
    }
  }
}

// --- Entry point ---

const cliOptions = parseCliOptions(Deno.args);
if (cliOptions.help) {
  console.log('Usage: deno run -A apps/server/index.ts [proof] [code]');
  console.log('       deno run -A apps/server/index.ts --proof <proof> [--code <code|domain>]');
  Deno.exit(0);
}

let code = normalizeCode(cliOptions.code || '');
let proof = (cliOptions.proof || '').trim();

if (isDomainCode(code)) {
  if (!proof) {
    console.error('A proof is required when using a domain code.');
    Deno.exit(1);
  }
} else if (code) {
  const derivedCode = await codeFromProof(proof);
  if (!proof || code !== derivedCode) {
    console.error(`Proof does not map to code "${code}". Expected "${derivedCode}".`);
    Deno.exit(1);
  }
} else {
  proof ||= createRandomProof();
  code = await codeFromProof(proof);
}

console.log(`[0k server] Tunnel code: ${code}`);
console.log(`[0k server] Proof: ${proof}`);
if (isDomainCode(code)) {
  const proofHash = await sha256HexFromText(proof);
  console.log(`[0k server] Publish this at https://${code}/0k-hash: ${proofHash}`);
}
const onSignal = () => {
  shutdown();
  Deno.exit(0);
};
Deno.addSignalListener('SIGINT', onSignal);
Deno.addSignalListener('SIGTERM', onSignal);
console.log(`[0k server] Waiting for offers for tunnel code "${code}".`);
await lookForOffers(code, proof);
