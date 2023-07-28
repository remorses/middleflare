<div align='center'>
    <br/>
    <br/>
    <img src='' width='320px'>
    <br/>
    <h3>middleflare</h3>
    <p>Deploy Next.js middleware to Cloudflare Workers</p>
    <br/>
    <br/>
</div>

## Why

This tool is very useful if you deploy your Next.js app with Docker but you want to keep middleware on the edge instead

Adding Cloudflare workers on top of your app will have several benefits:

-   Caching of static assets
-   DDOS protection
-   Faster redirects and rewrites

## Installation

```
npm i -D middleflare wrangler
```

> [wrangler](https://developers.cloudflare.com/workers/wrangler/) is needed to manage the resulting Cloudflare worker

## Usage

You should create a directory for your Cloudflare worker code, even better if you create a new package in your workspace

Then you create a `wrangler.toml` file like this

```toml
account_id = "xxxxxx"
compatibility_date = "2022-03-22"
# zone_id = "d41b2e6b12fa08bd2105acbe3827d1a9"

main = "./dist/worker.js"

[build]
command = "yarn middleflare --middleware ../website/src/middleware.ts --url http://localhost:3000"

```

You can find your `account_id` in the Cloudflare dashboard.

## Run locally

The toml config above should be enough to run `wrangler` locally and preview your worker:

```bash
wrangler dev
```

## Environment variables

To use environment variables you need to inject them in the build command, here is an example using Doppler to inject them

```toml
# ...

[build]
command = "doppler run -c dev -- yarn middleflare --middleware ../website/src/middleware.ts --url http://localhost:3000"
```

I recommend using a tool like [Doppler](https://www.doppler.com) for your environment variables, if you prefer keeping a `.env` file you can use `dotenv` to inject them in the build command

```toml
# ...

[build]
command = "dotenv -e .env yarn middleflare --middleware ../website/src/middleware.ts --url http://localhost:3000"
```

## Deployment

To deploy your worker you can change your `wrangler.toml` to add an environment and a custom domain

A wrangler environment is just a way to manage multiple workers with a single `wrangler.toml` file.

```toml
account_id = "xxxxxxx"
compatibility_date = "2022-03-22"

main = "./dist/worker.js"

[build]
command = "yarn middleflare --middleware ../website/src/middleware.ts --url http://localhost:3000"

[env.production]
name = "website-worker-production"
route = { pattern = "example.com", zone_name = "example.com", custom_domain = true }
[env.production.build]
command = "yarn middleflare --middleware ../website/src/middleware.ts --url https://my-deployed-next-app.fly.dev"
```

This config adds a `production` environment that will be deployed to `example.com` and will use the `https://my-deployed-next-app.fly.dev` as the origin for the middleware.

Notice that you need to pass your deployed Next.js app url, most hosting platforms generate an url like that for you, some examples are fly.io, railway and heroku. If not you can connect one yourself with DNS.

Then you can deploy your worker with

```bash
wrangler publish --env production
```

## Don't embed environment variables in the generated worker code

By default `middleflare` will embed your environment variables in the generated worker code, this is useful to get something working quickly.

A better way to pass env variables is with Cloudflare secrets, here is an example script you could use to deploy your Cloudflare worker

```ts
import { shell } from '@xmorse/deployment-utils/src'

await shell(`echo deploying worker`)

const stage = 'production'

console.log(`deploying to environment ${stage}`)

const tempFile = `/tmp/.env.${stage}.temp.json`
fs.writeFileSync(tempFile, JSON.stringify(env, null, 2))

await shell(`pnpm wrangler secret:bulk --env ${stage} ${quote(tempFile)}`)

await fs.promises.unlink(tempFile)

await shell(`pnpm wrangler deploy --env ${stage}`)
```

You will also need to add the `--use-secrets` argument to the `build` command in your `wrangler.toml`

```toml
# ...

[env.production.build]
command = "yarn middleflare --use-secrets --middleware ../website/src/middleware.ts --url https://my-deployed-next-app.fly.dev"
```

## Origin Story

https://twitter.com/__morse/status/1684567607830261761
