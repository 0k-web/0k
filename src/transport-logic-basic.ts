import { makeBody } from './transport-logic+';
import { maybeOverrideWeakContentType } from './contentTypes';

export const loadPassthrough = async (url: string) => {
  const r = await fetch(url);
  return makeBody(r.status, r.statusText, r.headers, r.body!);
};
export const loadGitHubIo = async (
  host: string,
  pathname: string,
  urlFn: (repo: string, refAndPath: string) => string,
) => {
  const owner = host.split('.')[0];
  const repo = `${owner}/${owner}.github.io`;

  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }
  pathname = 'main' + pathname;

  const r = await fetch(urlFn(repo, pathname));
  if (r.ok && r.body) {
    const headers = new Headers(r.headers);
    maybeOverrideWeakContentType(headers, pathname);
    return makeBody(r.status, r.statusText, headers, r.body);
  }
  return makeBody(404, 'Not Found', new Headers(), 'Not available');
};
