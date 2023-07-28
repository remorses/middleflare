import { cac } from 'cac'
import { buildMiddleware } from './build'
const { name, version } = require('../package.json')

const cli = cac(name)

cli.command('')
    .option('--url <url>', 'Your deployed Next.js url, like xxx.fly.dev', {})
    .option('--middleware <middlewarePath>', 'Your Next.js middleware path', {})
    .action(async (opts) => {
        console.log(opts)
        const { middleware, url } = opts
        await buildMiddleware({
            middleware,
            url,
        })
    })

cli.help()
cli.version(version)

async function main() {
    try {
        // Parse CLI args without running the command
        cli.parse(process.argv, { run: false })
        // Run the command yourself
        // You only need `await` when your command action returns a Promise
        await cli.runMatchedCommand()
    } catch (error: any) {
        // Handle error here..
        // e.g.
        console.error(error.stack)
        process.exit(1)
    }
}

main()
