// Wisp v2 client — multiplexes TCP streams over a single WebSocket
// See: https://github.com/MercuryWorkshop/wisp-protocol/blob/v2/protocol.md

const PACKET_TYPE_CONNECT = 0x01;
const PACKET_TYPE_DATA = 0x02;
const PACKET_TYPE_CONTINUE = 0x03;
const PACKET_TYPE_CLOSE = 0x04;
const PACKET_TYPE_INFO = 0x05;

const STREAM_TYPE_TCP = 0x01;

export class WispStream {
  readonly streamId: number;
  readonly hostname: string;
  readonly port: number;
  private bufferRemaining = 0;
  private pendingData: Uint8Array[] = [];
  private send: (type: number, streamId: number, payload: Uint8Array) => void;
  private _closed = false;

  ondata: ((data: Uint8Array) => void) | null = null;
  onclose: ((reason?: number) => void) | null = null;

  constructor(
    streamId: number,
    hostname: string,
    port: number,
    initialBuffer: number,
    send: (type: number, streamId: number, payload: Uint8Array) => void,
  ) {
    this.streamId = streamId;
    this.hostname = hostname;
    this.port = port;
    this.bufferRemaining = initialBuffer;
    this.send = send;
  }

  grantBuffer(size: number) {
    this.bufferRemaining += size;
    this.flushPending();
  }

  receiveData(data: Uint8Array) {
    this.ondata?.(data);
  }

  close(reason = 0x01) {
    if (this._closed) return;
    this._closed = true;
    this.send(PACKET_TYPE_CLOSE, this.streamId, new Uint8Array([reason]));
    this.onclose?.(reason);
  }

  sendToStream(data: Uint8Array) {
    if (this._closed) return;
    if (this.bufferRemaining > 0) {
      this.bufferRemaining--;
      this.send(PACKET_TYPE_DATA, this.streamId, data);
    } else {
      this.pendingData.push(data);
    }
  }

  remoteClose(reason: number) {
    if (this._closed) return;
    this._closed = true;
    this.onclose?.(reason);
  }

  private flushPending() {
    while (this.bufferRemaining > 0 && this.pendingData.length > 0) {
      const data = this.pendingData.shift()!;
      this.bufferRemaining--;
      this.send(PACKET_TYPE_DATA, this.streamId, data);
    }
  }
}

export class WispClient {
  private ws: WebSocket;
  private streams = new Map<number, WispStream>();
  private initialBuffer = 0;
  private handshakeComplete = false;
  private handshakeResolve: ((value: void) => void) | null = null;
  private handshakeReject: ((reason: Error) => void) | null = null;
  private usedStreamIds = new Set<number>();

  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.ws = new WebSocket(url, 'wisp');
    this.ws.binaryType = 'arraybuffer';

    const handshake = new Promise<void>((resolve, reject) => {
      this.handshakeResolve = resolve;
      this.handshakeReject = reject;
    });

    this.ws.onopen = () => {
      // Server sends INFO first, we respond after receiving it
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(new Uint8Array(event.data as ArrayBuffer));
    };

    this.ws.onclose = () => {
      for (const stream of this.streams.values()) stream.remoteClose(0x03);
      this.streams.clear();
      this.onclose?.();
      if (!this.handshakeComplete) {
        this.handshakeReject?.(new Error('WebSocket closed during handshake'));
      }
    };

    this.ws.onerror = () => {
      if (!this.handshakeComplete) {
        this.handshakeReject?.(new Error('WebSocket error during handshake'));
      }
    };

    this.connected = handshake;
  }

  readonly connected: Promise<void>;

  connect(hostname: string, port: number): WispStream {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Wisp WebSocket is not open');
    }

    const streamId = this.generateStreamId();
    const stream = new WispStream(streamId, hostname, port, this.initialBuffer, (type, id, payload) =>
      this.sendPacket(type, id, payload),
    );
    this.streams.set(streamId, stream);

    // CONNECT payload: stream_type (uint8) + port (uint16) + hostname (UTF-8)
    const hostnameBytes = new TextEncoder().encode(hostname);
    const payload = new Uint8Array(3 + hostnameBytes.length);
    const view = new DataView(payload.buffer);
    payload[0] = STREAM_TYPE_TCP;
    view.setUint16(1, port, true);
    payload.set(hostnameBytes, 3);

    this.sendPacket(PACKET_TYPE_CONNECT, streamId, payload);
    return stream;
  }

  close() {
    for (const stream of this.streams.values()) stream.close(0x02);
    this.streams.clear();
    this.ws.close();
  }

  private generateStreamId(): number {
    let id: number;
    do {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      id = buf[0]!;
    } while (id === 0 || this.usedStreamIds.has(id));
    this.usedStreamIds.add(id);
    return id;
  }

  private sendPacket(type: number, streamId: number, payload: Uint8Array) {
    const packet = new Uint8Array(5 + payload.length);
    const view = new DataView(packet.buffer);
    packet[0] = type;
    view.setUint32(1, streamId, true);
    packet.set(payload, 5);
    this.ws.send(packet);
  }

  private handleMessage(data: Uint8Array) {
    if (data.length < 5) return;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const type = data[0]!;
    const streamId = view.getUint32(1, true);
    const payload = data.subarray(5);

    switch (type) {
      case PACKET_TYPE_INFO:
        this.handleInfo(streamId, payload);
        break;
      case PACKET_TYPE_CONTINUE:
        this.handleContinue(streamId, payload);
        break;
      case PACKET_TYPE_DATA:
        this.handleData(streamId, payload);
        break;
      case PACKET_TYPE_CLOSE:
        this.handleClose(streamId, payload);
        break;
    }
  }

  private handleInfo(_streamId: number, payload: Uint8Array) {
    if (payload.length < 2) return;

    // Parse server extensions (we don't need any for basic TCP)
    // Send client INFO: version 2.1, no extensions
    const clientInfo = new Uint8Array(2); // major=2, minor=1, no extensions
    clientInfo[0] = 2; // major
    clientInfo[1] = 1; // minor
    this.sendPacket(PACKET_TYPE_INFO, 0, clientInfo);
  }

  private handleContinue(streamId: number, payload: Uint8Array) {
    if (streamId === 0 && !this.handshakeComplete) {
      // Handshake CONTINUE — initial buffer size
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      this.initialBuffer = payload.length >= 4 ? view.getUint32(0, true) : 64;
      this.handshakeComplete = true;
      this.handshakeResolve?.();
      return;
    }

    const stream = this.streams.get(streamId);
    if (!stream) return;

    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const bufferSize = payload.length >= 4 ? view.getUint32(0, true) : 0;
    stream.grantBuffer(bufferSize);
  }

  private handleData(streamId: number, payload: Uint8Array) {
    const stream = this.streams.get(streamId);
    if (stream) stream.receiveData(payload);
  }

  private handleClose(streamId: number, payload: Uint8Array) {
    if (streamId === 0 && !this.handshakeComplete) {
      this.handshakeReject?.(new Error('Server rejected handshake'));
      return;
    }
    const stream = this.streams.get(streamId);
    if (stream) {
      const reason = payload.length > 0 ? payload[0] : 0x01;
      stream.remoteClose(reason);
      this.streams.delete(streamId);
      this.usedStreamIds.delete(streamId);
    }
  }
}
