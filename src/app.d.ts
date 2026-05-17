type GitHubBehavior = 'githubusercontent' | 'jsdelivr' | 'esmsh' | 'statically' | 'off';

declare global {
  var $scramjet: typeof import('@mercuryworkshop/scramjet');
  const defaultGitHubBehavior: GitHubBehavior;
}

export {};
