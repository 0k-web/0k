import { DurableObject, env } from 'cloudflare:workers';
import {
  ampMagicBytes,
  isDomainCode,
  normalizeCode,
  codeFromProof,
  sha256HexFromText,
} from '@0k-web/lib';

const textEncoder = new TextEncoder();

const Errors = {
  ALREADY_HAVE_TUNNEL: "There's already a tunnel here",
  NO_TUNNEL: "There isn't a tunnel here",
  OFFER_NOT_PRESENT: 'Offer not present',
} as const;

const ErrorStatuses: Record<string, number> = {
  [Errors.ALREADY_HAVE_TUNNEL]: 409,
  [Errors.NO_TUNNEL]: 503,
  [Errors.OFFER_NOT_PRESENT]: 404,
};

function getCodeParam(url: URL) {
  return normalizeCode(url.searchParams.get('code') ?? '');
}

async function verifyTunnelProof(code: string, proof: string) {
  if (!proof.trim()) {
    return false;
  }

  if (!isDomainCode(code)) {
    return (await codeFromProof(proof)) === code;
  }

  const response = await fetch(new URL('/0k-hash', `https://${code}`), {
    redirect: 'follow',
  });
  if (!response.ok) {
    return false;
  }

  return (await response.text()).trim().toLowerCase() === (await sha256HexFromText(proof));
}

function requireCode(code: string) {
  if (!code) {
    throw new Response('Must include code', { status: 400 });
  }
}

async function requireTunnelProof(code: string, url: URL) {
  requireCode(code);

  const proof = url.searchParams.get('proof') ?? '';
  if (!proof) {
    throw new Response('Must include proof', { status: 400 });
  }

  if (!(await verifyTunnelProof(code, proof))) {
    throw new Response('Code proof did not verify', { status: 403 });
  }
}

export class Tunnel extends DurableObject<Env> {
  private directConnectionToTunnel: ReadableByteStreamController | undefined;
  private waitingOffers: Record<string, (answer: string) => void> = {};

  lookForOffers(): ReadableStream<Uint8Array> {
    if (this.directConnectionToTunnel) {
      throw new Error(Errors.ALREADY_HAVE_TUNNEL);
    }

    const readable: ReadableStream<Uint8Array> = new ReadableStream({
      type: 'bytes',
      start: (controller) => {
        this.directConnectionToTunnel = controller;
      },
      cancel: () => {
        if (this.directConnectionToTunnel) {
          this.directConnectionToTunnel = undefined;
        }
      },
    } satisfies UnderlyingByteSource);

    setTimeout(() => {
      if (this.directConnectionToTunnel) {
        this.directConnectionToTunnel.close();
        this.directConnectionToTunnel = undefined;
      }
    }, 60000 * 5);

    return readable;
  }

  async sendOffer(offer: string) {
    if (!this.directConnectionToTunnel) {
      throw new Error(Errors.NO_TUNNEL);
    }
    const answerPromise = new Promise<string>((resolve) => {
      this.waitingOffers[offer] = resolve;
    });
    this.directConnectionToTunnel.enqueue(textEncoder.encode(JSON.stringify(offer) + '\n'));

    return await answerPromise;
  }

  async acceptOffer(offer: string, answer: string) {
    const send = this.waitingOffers[offer];
    if (!send) {
      throw new Error(Errors.OFFER_NOT_PRESENT);
    }

    send(answer);
  }
}

export default {
  async fetch(req): Promise<Response> {
    try {
      const url = new URL(req.url);
      const code = getCodeParam(url);

      if (url.pathname === '/lookForOffers') {
        if (req.method !== 'GET') {
          throw new Response('Must GET', { status: 405 });
        }
        await requireTunnelProof(code, url);

        const stub = env.TUNNELS.getByName(code);
        const stream = await stub.lookForOffers();
        return new Response(stream, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
          },
        });
      }

      if (url.pathname === '/sendOffer') {
        const offer = url.searchParams.get('offer');
        requireCode(code);
        if (!offer) {
          throw new Response('Must include offer', { status: 400 });
        }

        const stub = env.TUNNELS.getByName(code);
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
        await requireTunnelProof(code, url);
        if (!offer) {
          throw new Response('Must include offer', { status: 400 });
        }
        if (!answer) {
          throw new Response('Must include answer', { status: 400 });
        }

        const stub = env.TUNNELS.getByName(code);
        await stub.acceptOffer(offer, answer);
        return new Response('OK');
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      if (error instanceof Error && error.message in ErrorStatuses) {
        return new Response(error.message, { status: ErrorStatuses[error.message] });
      }
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
