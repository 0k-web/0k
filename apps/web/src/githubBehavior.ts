const GITHUB_BEHAVIOR_VALUES = ['githubusercontent', 'jsdelivr', 'statically', 'off'] as const;
type GitHubBehavior = (typeof GITHUB_BEHAVIOR_VALUES)[number];

const GITHUB_BEHAVIOR_LABELS: Record<GitHubBehavior, string> = {
  githubusercontent: 'Via raw.githubusercontent.com',
  jsdelivr: 'Via cdn.jsdelivr.net',
  statically: 'Via cdn.statically.io',
  off: 'Off',
};

export const githubBehaviorOptions = GITHUB_BEHAVIOR_VALUES.map((value) => ({
  value,
  label: GITHUB_BEHAVIOR_LABELS[value],
}));

export const normalizeGitHubBehavior = (
  value: string | undefined,
  fallback: GitHubBehavior = GITHUB_BEHAVIOR_VALUES[0],
): GitHubBehavior => {
  for (const candidate of GITHUB_BEHAVIOR_VALUES) {
    if (candidate == value) {
      return candidate;
    }
  }

  return fallback;
};
