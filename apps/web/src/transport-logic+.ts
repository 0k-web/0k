import type { FetchBodyType } from '@mercuryworkshop/proxy-transports';

export const makeBody = (
  status: number,
  statusText: string,
  headers: Headers,
  body: FetchBodyType,
) => ({
  status,
  statusText,
  headers: [...headers],
  body,
});
export const rawGithubusercontentCom = (repo: string, refAndPath: string) =>
  `https://raw.githubusercontent.com/${repo}/${refAndPath}`;
export const cdnJsdelivrNet = (repo: string, refAndPath: string) =>
  `https://cdn.jsdelivr.net/gh/${repo}@${refAndPath}`;
export const cdnStaticallyIo = (repo: string, refAndPath: string) =>
  `https://cdn.statically.io/gh/${repo}@${refAndPath}`;
export const cdnEsmSh = (repo: string, refAndPath: string) =>
  `https://raw.esm.sh/gh/${repo}@${refAndPath}`;
