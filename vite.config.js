import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: '/',
  optimizeDeps: {
    include: [
      'ethers',
      '@ethersproject/providers',
      '@ethersproject/abi',
      '@ethersproject/bignumber',
      'bn.js',
      'js-sha3'
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  define: {
    global: {},
  },
}));
