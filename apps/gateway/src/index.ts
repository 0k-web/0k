import { DurableObject, env } from 'cloudflare:workers';
import {
  ampMagicBytes,
  isDomainRoom,
  normalizeRoom,
  roomFromProof,
  sha256HexFromText,
} from '@0k/lib';

const textEncoder = new TextEncoder();

function getRoomParam(url: URL) {
  return normalizeRoom(url.searchParams.get('room') ?? url.searchParams.get('code') ?? '');
}

async function verifyHostProof(room: string, proof: string) {
  if (!proof.trim()) {
    return false;
  }

  if (!isDomainRoom(room)) {
    return (await roomFromProof(proof)) === room;
  }

  const response = await fetch(new URL('/0k-hash', `https://${room}`), {
    redirect: 'follow',
  });
  if (!response.ok) {
    return false;
  }

  return (await response.text()).trim().toLowerCase() === (await sha256HexFromText(proof));
}

function requireRoom(room: string) {
  if (!room) {
    throw new Response('Must include room', { status: 400 });
  }
}

async function requireHostProof(room: string, url: URL) {
  requireRoom(room);

  const proof = url.searchParams.get('proof') ?? '';
  if (!proof) {
    throw new Response('Must include proof', { status: 400 });
  }

  if (!(await verifyHostProof(room, proof))) {
    throw new Response('Room proof did not verify', { status: 403 });
  }
}

export class Room extends DurableObject<Env> {
  private directConnectionToHost: ReadableByteStreamController | undefined;
  private waitingOffers: Record<string, (answer: string) => void> = {};

  lookForOffers(): ReadableStream<Uint8Array> {
    if (this.directConnectionToHost) {
      throw new Error('Host already connected');
    }

    const readable: ReadableStream<Uint8Array> = new ReadableStream({
      type: 'bytes',
      start: (controller) => {
        this.directConnectionToHost = controller;
      },
      cancel: () => {
        if (this.directConnectionToHost) {
          this.directConnectionToHost = undefined;
        }
      },
    } satisfies UnderlyingByteSource);

    setTimeout(() => {
      if (this.directConnectionToHost) {
        this.directConnectionToHost.close();
        this.directConnectionToHost = undefined;
      }
    }, 60000 * 5);

    return readable;
  }

  async sendOffer(offer: string) {
    if (!this.directConnectionToHost) {
      throw new Error('Host not yet connected');
    }
    const answerPromise = new Promise<string>((resolve) => {
      this.waitingOffers[offer] = resolve;
    });
    this.directConnectionToHost.enqueue(textEncoder.encode(JSON.stringify(offer) + '\n'));

    return await answerPromise;
  }

  async acceptOffer(offer: string, answer: string) {
    const send = this.waitingOffers[offer];
    if (!send) {
      throw new Error('Offer not present');
    }

    send(answer);
  }
}

export default {
  async fetch(req): Promise<Response> {
    try {
      const url = new URL(req.url);
      const room = getRoomParam(url);

      if (url.pathname === '/lookForOffers') {
        if (req.method !== 'GET') {
          throw new Response('Must GET', { status: 405 });
        }
        await requireHostProof(room, url);

        const stub = env.ROOMS.getByName(room);
        const stream = await stub.lookForOffers();
        return new Response(stream, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
          },
        });
      }

      if (url.pathname === '/sendOffer') {
        const offer = url.searchParams.get('offer');
        requireRoom(room);
        if (!offer) {
          throw new Response('Must include offer', { status: 400 });
        }

        const stub = env.ROOMS.getByName(room);
        let answer: string;
        try {
          answer = await stub.sendOffer(offer);
        } catch (error) {
          answer = JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          });
        }
        const answerEncoded = new TextEncoder().encode(answer);
        return new Response(
          new Blob([ampMagicBytes, answerEncoded], { type: 'application/octet-stream' }),
        );
      }

      if (url.pathname === '/acceptOffer') {
        const offer = url.searchParams.get('offer');
        const answer = url.searchParams.get('answer');
        await requireHostProof(room, url);
        if (!offer) {
          throw new Response('Must include offer', { status: 400 });
        }
        if (!answer) {
          throw new Response('Must include answer', { status: 400 });
        }

        const stub = env.ROOMS.getByName(room);
        await stub.acceptOffer(offer, answer);
        return new Response('OK');
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
