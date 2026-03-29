import type {
  ProxyTransport,
  RawHeaders,
  WebSocketDataType,
  TransferrableResponse,
  FetchBodyType,
} from '@mercuryworkshop/proxy-transports';
import { keyGitHubBehavior } from './settings/settingsLocalStorage';
import { loadGitHubIo, loadHome, loadNotKnown, loadPassthrough } from './transport-logic-basic';
import { rawGithubusercontentCom, cdnJsdelivrNet, makeBody } from './transport-logic+';

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
    const githubBehavior = localStorage[keyGitHubBehavior] || 'githubusercontent';

    const isHome = method == 'GET' && remote.href == 'https://home.0k/';
    const isLocalSite = method == 'GET' && remote.host.endsWith('.0k');
    const isPassthrough = method == 'GET' && remote.host == 'fonts.googleapis.com';
    const isGithubIo = method == 'GET' && remote.host.endsWith('.github.io');
    const matchGithubRaw =
      method == 'GET' &&
      remote.href.match(
        /^https:\/\/github\.com\/([a-zA-Z0-9-]+\/[a-zA-Z0-9-.]+)\/blob\/([a-zA-Z0-9-]+\/.+)?raw=true$/,
      );
    if (isHome) {
      return loadHome();
    }
    if (isLocalSite) {
      const cacheName = `0k-site/${remote.host.replace('.0k', '')}`;
      const cacheExists = await caches.has(cacheName);
      if (!cacheExists) {
        return makeBody(404, 'Not Found', new Headers(), `No local site called "${remote.host}".`);
      }
      const cache = await caches.open(cacheName);
      const response = await cache.match(remote.origin + remote.pathname);
      if (!response) {
        return makeBody(404, 'Not Found', new Headers(), `No files at "${remote.pathname}".`);
      }
      return makeBody(200, 'OK', response.headers, response.body!);
    }
    if (isPassthrough) {
      return await loadPassthrough(remote.href);
    }

    if (isGithubIo && githubBehavior == 'githubusercontent') {
      return await loadGitHubIo(remote.host, remote.pathname, rawGithubusercontentCom);
    }
    if (isGithubIo && githubBehavior == 'jsdelivr') {
      return await loadGitHubIo(remote.host, remote.pathname, cdnJsdelivrNet);
    }

    if (matchGithubRaw && githubBehavior == 'githubusercontent') {
      return await loadPassthrough(rawGithubusercontentCom(matchGithubRaw[1], matchGithubRaw[2]));
    }
    if (matchGithubRaw && githubBehavior == 'jsdelivr') {
      return await loadPassthrough(cdnJsdelivrNet(matchGithubRaw[1], matchGithubRaw[2]));
    }

    return loadNotKnown();
  }
}
