import { build, context, PluginBuild } from 'esbuild'

import { polyfillNode } from 'esbuild-plugin-polyfill-node'

import fs from 'fs'

import path from 'path'

// console.log(process.env.DIRECT_URL)

export async function buildMiddleware({ middleware, url }) {
    if (!middleware) {
        throw new Error(`--middleware is required`)
    }
    if (!url) {
        throw new Error(`--url is required`)
    }
    middleware = path.resolve(middleware)
    const u = safeUrl(url)
    if (!u) {
        throw new Error(`invalid url ${url}`)
    }
    // to make docker generate native prisma addons
    const define = Object.fromEntries(
        Object.keys(process.env).map((k) => {
            return [`process.env.${k}`, JSON.stringify(process.env[k])]
        }),
    )
    fs.promises.unlink('dist').catch((e) => null)
    const index = path.resolve(
        path.dirname(require.resolve('../package.json')),
        'src/index.ts',
    )
    const { metafile } = await build({
        // entryPoints: ['src/worker.ts'],
        stdin: {
            contents: `
            import { middlewareAdapter } from '${index}';
            export default middlewareAdapter({
                middlewareModule: await import('${middleware}'),
                finalUrl: '${url}',
            })
            `,
            resolveDir: process.cwd(),
            loader: 'ts',
        },
        bundle: true,
        platform: 'browser',
        sourcemap: false,
        // sourcemap: 'inline',
        metafile: true,
        format: 'esm',
        minify: false,
        // format: 'esm',
        // mainFields: ['module', 'main'],
        plugins: [
            LooselyIgnoreDeps(),
            polyfillNode(), //
            StripWasmModulesQuery(),
            // UseNextEsm(),
        ],
        external: [],
        // target: 'node18',
        logOverride: {
            'import-is-undefined': 'silent',
        },
        define,
        // splitting: false,
        // splitting: true,
        // outdir: 'dist',
        outfile: 'dist/worker.js',
    })

    fs.writeFileSync('dist/metafile.json', JSON.stringify(metafile, null, 2))
}

const ignore = ['@vercel/og']
function LooselyIgnoreDeps() {
    return {
        name: 'Skip binaries',
        setup(build: PluginBuild) {
            const ignorePath = '/__ignore__'
            build.onLoad({ filter: /__ignore__/ }, (args) => {
                return {
                    contents: '',
                    loader: 'js',
                }
            })
            build.onResolve(
                {
                    filter: /.*/,
                },
                (args) => {
                    if (
                        ignore.some(
                            (x) => args.path === x || args.path.includes(x),
                        )
                    ) {
                        return { path: ignorePath }
                    }
                    return
                },
            )
        },
    }
}

function UseNextEsm() {
    return {
        name: 'Use next esm',
        setup(build: PluginBuild) {
            build.onResolve(
                {
                    filter: /\/next\/dist.*/,
                },
                (args) => {
                    if (!args.path.includes('node_modules')) {
                        return
                    }
                    if (!args.path.startsWith('next/')) {
                        return
                    }
                    const newPath = args.path.replace(
                        '/next/dist/',
                        '/next/dist/esm/',
                    )

                    return {
                        path: newPath,
                    }
                },
            )
        },
    }
}

function StripWasmModulesQuery() {
    return {
        name: 'wasm modules',
        setup(build: PluginBuild) {
            build.onResolve(
                {
                    filter: /\.wasm(?:\?.*)?/,
                },
                (args) => {
                    return {
                        path: removeQuery(
                            path.isAbsolute(args.path)
                                ? args.path
                                : path.join(args.resolveDir, args.path),
                        ),
                        sideEffects: false,
                    }
                },
            )
            build.onLoad(
                {
                    filter: /\.wasm(?:\?.*)?/,
                },
                (args) => {
                    return {
                        resolveDir: path.dirname(args.path),
                        contents: fs.readFileSync(args.path),
                        loader: 'copy',
                    }
                },
            )
        },
    }
}

function removeQuery(url: string) {
    const i = url.indexOf('?')
    if (i === -1) return url
    return url.slice(0, i)
}

function safeUrl(url: string) {
    try {
        return new URL(url)
    } catch (e) {
        return null
    }
}
