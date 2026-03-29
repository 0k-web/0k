import { DurableObject, env } from 'cloudflare:workers';
import ampMagicBytes from './amp-magic-bytes';

const textEncoder = new TextEncoder();

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
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    if (url.pathname == '/lookForOffers') {
      if (req.method != 'GET') return new Response('Must GET', { status: 405 });
      if (!code) return new Response('Must include code', { status: 400 });

      const stub = env.ROOMS.getByName(code);
      const stream = await stub.lookForOffers();
      return new Response(stream, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
      });
    }
    if (url.pathname == '/sendOffer') {
      const offer = url.searchParams.get('offer');
      if (!code) return new Response('Must include code', { status: 400 });
      if (!offer) return new Response('Must include offer', { status: 400 });

      const stub = env.ROOMS.getByName(code);
      const answer = await stub.sendOffer(offer);
      const answerEncoded = new TextEncoder().encode(answer);
      return new Response(
        new Blob([ampMagicBytes, answerEncoded], { type: 'application/octet-stream' }),
      );
    }
    if (url.pathname == '/acceptOffer') {
      const offer = url.searchParams.get('offer');
      const answer = url.searchParams.get('answer');
      if (!code) return new Response('Must include code', { status: 400 });
      if (!offer) return new Response('Must include offer', { status: 400 });
      if (!answer) return new Response('Must include answer', { status: 400 });

      const stub = env.ROOMS.getByName(code);
      await stub.acceptOffer(offer, answer);
      return new Response('OK');
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
