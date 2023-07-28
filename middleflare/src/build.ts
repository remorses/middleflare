import { build, context, PluginBuild } from 'esbuild'

import { polyfillNode } from 'esbuild-plugin-polyfill-node'

import fs from 'fs'

import path from 'path'

// console.log(process.env.DIRECT_URL)

export async function buildMiddleware({ useSecrets, middleware, url }) {
    console.log(`Bundling middleware to dist/worker.js`)
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

    let envVars = !useSecrets
        ? Object.fromEntries(
              Object.keys(process.env).map((k) => {
                  return [`process.env.${k}`, JSON.stringify(process.env[k])]
              }),
          )
        : Object.fromEntries(
              Object.keys(process.env).map((k) => {
                  return [`process.env.${k}`, 'globalThis.__ENV__.' + k]
              }),
          )
    fs.promises.unlink('dist').catch((e) => null)
    const index = path.resolve(
        path.dirname(require.resolve('../package.json')),
        'src/index.ts',
    )
    const { metafile } = await build({
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
            UseNextEsm(),
            polyfillNode({
                globals: {
                    global: true,
                    buffer: true,
                    navigator: true,
                    process: true,
                },
            }), //
            StripWasmModulesQuery(),
        ],
        external: [],

        define: envVars,

        outfile: 'dist/worker.js',
    })

    fs.writeFileSync('dist/metafile.json', JSON.stringify(metafile, null, 2))
}

function UseNextEsm() {
    return {
        name: 'Use next esm',
        setup(build: PluginBuild) {
            const newServerPath = 'esm-next-server-exports'
            build.onResolve(
                {
                    filter: /^next(\/.*)?/,
                },
                (args) => {
                    const p = require.resolve(args.path, {
                        paths: [args.resolveDir],
                    })
                    if (args.path === 'next/server') {
                        return {
                            path: path.resolve(args.resolveDir, newServerPath),
                            sideEffects: false,
                        }
                    }
                    const newPath = p.replace('/next/dist/', '/next/dist/esm/')
                    if (fs.existsSync(newPath)) {
                        // console.log('p', newPath)
                        return {
                            path: newPath,
                            sideEffects: false,
                        }
                    }
                },
            )

            build.onLoad(
                {
                    filter: new RegExp(newServerPath),
                },
                (args) => {
                    return {
                        resolveDir: path.dirname(args.path),
                        loader: 'js',

                        contents: `
                        export { NextRequest } from 'next/dist/server/web/spec-extension/request'
                        export { NextResponse } from 'next/dist/server/web/spec-extension/response'
                        export { ImageResponse } from 'next/dist/server/web/spec-extension/image-response'
                        export {
                            userAgent,
                            userAgentFromString,
                        } from 'next/dist/server/web/spec-extension/user-agent'
                        `,
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
