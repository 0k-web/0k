import type { GitHubBehavior } from './githubBehavior';

declare global {
  var $scramjet: typeof import('@mercuryworkshop/scramjet');
  const defaultGitHubBehavior: GitHubBehavior;
}

export {};
