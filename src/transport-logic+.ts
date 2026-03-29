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
  `https://raw.githubusercontent.com/${repo}/refs/heads/${refAndPath}`;
export const cdnJsdelivrNet = (repo: string, refAndPath: string) =>
  `https://cdn.jsdelivr.net/gh/${repo}@${refAndPath}`;
