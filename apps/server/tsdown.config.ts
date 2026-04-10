import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'index.ts',
  deps: {
    onlyBundle: false,
  },
  nodeProtocol: true,
});
