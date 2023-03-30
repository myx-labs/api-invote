# api-invote

This repository hosts the source code for MYX Labs inVote API.

## Important note

This system requires you to develop a custom in-game integration, which can be saved and processed by this API.

## Requirements

- Node.js v18 LTS+
- Postgres database
- PNPM package manager `npm i -g pnpm`

## Setup

- Obtain the required credentials mentioned in the requirements
- Create an `.env` file and configure based on `.env.example`
- Install dependencies with `pnpm i`
- Develop with automatic reload by running `pnpm dev`
- Build by running `pnpm build`
- Start by running `node dist/index.js`

## Licence

MIT Licence.
