# Trace Review Sites Adapter

This is the hosted Sites surface for Furry Image Studio Trace Review.

The image pipeline remains the only producer of eval traces. Before each build,
`scripts/generate-eval-data.mjs` snapshots the existing
`evals/outputs/*/manifest.json` sets and their referenced images into the hosted
application. The site does not accept uploads or generate images.

Hosted grades and pinned annotations are stored in D1. Exporting a review set
downloads a checksum-bearing ZIP that can be re-imported by the local reviewer.

## Commands

```bash
npm install
npm run dev
npm test
```

`npm run build` always refreshes the hosted evidence snapshot first. New pipeline
outputs therefore require a new build and deployment; they never enter the
reviewer through its UI.
