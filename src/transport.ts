import type {
  ProxyTransport,
  RawHeaders,
  WebSocketDataType,
  TransferrableResponse,
  FetchBodyType,
} from '@mercuryworkshop/proxy-transports';
import { keyGithubBehavior } from './config/configStorage';
import home from './assets/home.html?raw';

const makeBody = (status: number, statusText: string, headers: Headers, body: FetchBodyType) => ({
  status,
  statusText,
  headers: [...headers],
  body,
});
export class ZeroKTransport implements ProxyTransport {
  ready = true;
  async init() {}
  connect(
    url: URL,
    protocols: string[],
    requestHeaders: RawHeaders,
    onopen: (protocol: string, extensions: string) => void,
    onmessage: (data: WebSocketDataType) => void,
    onclose: (code: number, reason: string) => void,
    onerror: (error: string) => void,
  ) {
    throw new Error('Not implemented');
  }
  async request(
    remote: URL,
    method: string,
    body: BodyInit | null,
    headers: RawHeaders,
    signal: AbortSignal | undefined,
  ): Promise<TransferrableResponse> {
    const githubBehavior = localStorage[keyGithubBehavior] || 'githubusercontent';

    const isHome = method == 'GET' && remote.href == 'https://home.0k/';
    const isPassthrough = method == 'GET' && remote.host == 'fonts.googleapis.com';
    const isGithubIo = method == 'GET' && remote.host.endsWith('.github.io');
    const githubRawMatch =
      method == 'GET' &&
      remote.href.match(
        /^https:\/\/github\.com\/([a-zA-Z0-9-]+\/[a-zA-Z0-9-.]+)\/blob\/([a-zA-Z0-9-]+)(\/.+)?raw=true$/,
      );
    if (isHome) {
      const headers = new Headers();
      headers.set('content-type', 'text/html; charset=utf-8');
      return makeBody(200, 'OK', headers, home);
    }
    if (isPassthrough) {
      const r = await fetch(remote.href);
      return makeBody(r.status, r.statusText, r.headers, r.body!);
    }

    if (isGithubIo && githubBehavior == 'githubusercontent') {
      const owner = remote.host.split('.')[0];
      let path = remote.pathname;
      if (path.endsWith('/')) {
        path += 'index.html';
      }
      const r = await fetch(
        `https://raw.githubusercontent.com/${owner}/${owner}.github.io/refs/heads/main${path}`,
      );
      if (r.ok && r.body) {
        const headers = new Headers(r.headers);
        if (path.endsWith('.html')) {
          headers.set('content-type', 'text/html; charset=utf-8');
        }
        if (path.endsWith('.css')) {
          headers.set('content-type', 'text/css; charset=utf-8');
        }
        if (path.endsWith('.js')) {
          headers.set('content-type', 'text/javascript; charset=utf-8');
        }
        return makeBody(r.status, r.statusText, headers, r.body);
      }
      return makeBody(404, 'Not Found', new Headers(), 'Not available');
    }
    if (githubRawMatch && githubBehavior == 'githubusercontent') {
      const [, repo, branch, path] = githubRawMatch;
      const r = await fetch(
        `https://raw.githubusercontent.com/${repo}/refs/heads/${branch}${path}`,
      );
      return makeBody(r.status, r.statusText, r.headers, r.body!);
    }
    return makeBody(500, 'Internal Server Error', new Headers(), 'Not known');
  }
}
