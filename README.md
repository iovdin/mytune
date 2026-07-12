# My Tune tools

A personal collection of tools and processors for [Tune](https://github.com/iovdin/tune).

These are experimental or specialized utilities that are not (yet) part of [tune-basic-toolset](https://github.com/iovdin/tune-basic-toolset).

## Setup

```bash
npm install
```

Add this directory to your `TUNE_PATH` so [tune-fs](https://github.com/iovdin/tune-fs) can discover the tools:

```bash
export TUNE_PATH="$HOME/projects/mytune"
```

Make sure required credentials are available in your Tune context (e.g. `OPENROUTER_KEY` in `~/.tune/.env`, `google-key.json` in this directory).

---

##### Index
- [Tools](#tools)
  - [`ga4`](#ga4) query Google Analytics Data API
  - [`gs`](#gs) query Google Search Console API
  - [`imgen`](#imgen) generate or edit images via OpenRouter
  - [`nu`](#nu) execute Nushell commands
- [Processors](#processors)
  - [`commit`](#commit) record file changes in a SQLite database
  - [`response_api`](#response_api) openai response api wrapper over chat completion

## Tools

### `ga4`

Query the Google Analytics Data API. Returns report data as an aligned table.

```chat
system: @ga4
user: show me sessions and pageviews for last 7 days

tool_call: ga4 {"endpoint":"runReport"}
{
  "dateRanges": [{"startDate":"7daysAgo","endDate":"today"}],
  "dimensions": [{"name":"date"}],
  "metrics": [{"name":"sessions"},{"name":"screenPageViews"}]
}
tool_result:
date         sessions  screenPageViews
----------  ---------  ---------------
20250101        1234             5678
20250102        1357             5901
...
```

### `gs`

Query the Google Search Console API for search analytics. Returns rows as an aligned table with dimensions and metrics.

```chat
system: @gs
user: show me top 10 queries by clicks for last 28 days

tool_call: gs {"site":"https://example.com"}
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-28",
  "dimensions": ["query"],
  "rowLimit": 10
}
tool_result:
key1              clicks  impressions  ctr     position
---------------  -------  -----------  ------  --------
best widgets         342         5100  0.067      12.3
cheap widgets        198         3200  0.062      15.1
...
```

### `imgen`

Generate or edit images via OpenRouter image-generation models. The generated image is saved to a file.

```chat
system: @imgen
user: draw a watercolor mountain cabin at sunset

tool_call: imgen {"filename":"cabin.png"}
watercolor mountain cabin at sunset

tool_result:
image generated

---
↑500 ↓100 0.05¢
---
```

You can also use reference images for image-to-image generation:

```chat
tool_call: imgen {"filename":"cabin_night.png","images":["cabin.png"]}
make it night time with stars
tool_result:
image generated
```

Requires `OPENROUTER_KEY` in your Tune environment.

### `nu`

Execute a [Nushell](https://www.nushell.sh/) command. Useful for structured data queries and pipelines.

```chat
system: @nu
user: list all files larger than 1MB in current directory

tool_call: nu
ls | where size > 1mb | select name size

tool_result:
───┬──────────────────┬────────
 # │ name             │ size
───┼──────────────────┼────────
 0 │ bigfile.bin      │ 5.2 MB
 1 │ data.csv         │ 2.1 MB
───┴──────────────────┴────────
```

Requires `nu` installed and on `PATH`.

---

## Processors

### `commit`

Wraps a tool that has `filename` parameter and records file changes in a local SQLite database.
It is a cheap version of version control for ai, it commits on every change

```chat
system: @{ wf | commit } @{ patch | commit }
user: create a hello world script

tool_call: wf {"filename":"hello.js"}
console.log('Hello, World!');
tool_result:
written
commit: aBcD1234
```

The argument is the SQLite database filename (defaults to `.commits.sqlite`). The wrapped tool must accept a `filename` parameter.

You can review the history with the `sqlite` tool from tune-basic-toolset:

```chat
tool_call: sqlite {"filename":".commits.sqlite","format":"table"}
SELECT filename, sha, prev_sha, ts FROM commits ORDER BY ts DESC LIMIT 10;
```

### `response_api`
wraps new openai models to use new response api, 
because they often do not work otherwise

```chat
user:
@gpt-5.6-luna|response_api
@sh hi what is in my current directory?
tool_call: sh
# Safely show the current directory path and list its contents.
pwd && printf '\nContents:\n' && ls -la
```

it is experimental, does not support images and streaming
