import type {
  ProxyTransport,
  RawHeaders,
  WebSocketDataType,
  TransferrableResponse,
} from '@mercuryworkshop/proxy-transports';
import { normalizeGitHubBehavior } from './githubBehavior';
import { loadGitHubIo, loadHome, loadNotKnown, loadPassthrough } from './transport-logic-basic';
import {
  rawGithubusercontentCom,
  cdnJsdelivrNet,
  cdnStaticallyIo,
  makeBody,
} from './transport-logic+';
import { keyGitHubBehavior } from './settings/settingsLocalStorage';

export class ZeroKTransport implements ProxyTransport {
  ready = true;
  async init() {}
  connect(
    _url: URL,
    _protocols: string[],
    _requestHeaders: RawHeaders,
    _onopen: (protocol: string, extensions: string) => void,
    _onmessage: (data: WebSocketDataType) => void,
    _onclose: (code: number, reason: string) => void,
    onerror: (error: string) => void,
  ): [(data: WebSocketDataType) => void, (code: number, reason: string) => void] {
    queueMicrotask(() => {
      onerror('WebSocket transport is not implemented in ZeroKTransport');
    });

    return [() => {}, () => {}];
  }
  async request(
    remote: URL,
    method: string,
    _body: BodyInit | null,
    _headers: RawHeaders,
    _signal: AbortSignal | undefined,
  ): Promise<TransferrableResponse> {
    const githubBehavior = normalizeGitHubBehavior(
      localStorage[keyGitHubBehavior],
      defaultGitHubBehavior,
    );
    const githubUrlFn =
      githubBehavior == 'githubusercontent'
        ? rawGithubusercontentCom
        : githubBehavior == 'jsdelivr'
          ? cdnJsdelivrNet
          : githubBehavior == 'statically'
            ? cdnStaticallyIo
            : undefined;

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

    if (isGithubIo && githubUrlFn) {
      return await loadGitHubIo(remote.host, remote.pathname, githubUrlFn);
    }

    if (matchGithubRaw && githubUrlFn) {
      return await loadPassthrough(githubUrlFn(matchGithubRaw[1], matchGithubRaw[2]));
    }

    return loadNotKnown();
  }
}
