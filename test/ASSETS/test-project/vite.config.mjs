import { defineConfig } from 'vite'
import SpxPlugin from '../../../dist'

export default defineConfig(() => {
    return {
        plugins: [
            SpxPlugin({
                inputs: {
                    'nested-template/index.js': './layout.html',
                    '*.{js,ts}': './layout.html',
                },
                srcDir: 'src/templates',
                outDir: 'build',
            }),
        ],
        build: {
            rollupOptions: {
                output: {
                    // designed to make diffing easier
                    assetFileNames: 'assets/[name][extname]',
                    chunkFileNames: '[name].js',
                },
            },
        },
    }
})
