const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { parseArgs } = require('./utils');

const hash = (content) => crypto
  .createHash('sha1')
  .update(content)
  .digest('base64url');

module.exports = async function commit(node, args, ctx) {
  if (!node) return
  if (node.type !== "tool") {
    throw Error(`commit processor accepts only 'tool' nodes, got ${node.type}`)
  }

  const parsed = parseArgs(args);
  const outputDir = parsed.output || '.commits';
  const argName = parsed.arg || 'filename';

  return {
    ...node,
    exec: async function exec(params, ctx) {
      const filename = params[argName];
      if (!filename) {
        throw Error(`'${argName}' is not passed for tool ${node.name}`);
      }
      let oldVersion = await ctx.read(filename, true);
      const result = await node.exec.call(this, params, ctx)
      let newVersion = await ctx.read(filename, true);
      if (!newVersion) {
        throw Error(`commit: file content is empty ${filename}`);
      }

      // Ensure output directory exists
      fs.mkdirSync(outputDir, { recursive: true });

      const dbFile = path.join(outputDir, 'db.sqlite');
      const db = new DatabaseSync(dbFile);

      try {
        const prevSha = oldVersion ? hash(oldVersion) : null;
        const sha = hash(newVersion)
        const tool = node.name
        const paramsStr = JSON.stringify(params)

        // Derive basename (without dir and ext) and extension from filename
        const ext = path.extname(filename);
        const basename = path.basename(filename, ext);

        // Timestamp format: YYYYMMDDHHMMSS
        const now = new Date();
        const ts = now.getTime();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

        db.exec(`CREATE TABLE IF NOT EXISTS commits (
id INTEGER PRIMARY KEY AUTOINCREMENT,
filename TEXT NOT NULL,
sha TEXT NOT NULL,
prev_sha TEXT,
tool TEXT,
params TEXT,
content_path TEXT,
ts INTEGER NOT NULL
)`);

        // Check if there is a previous commit for this file in the database
        const hasPrevCommit = db.prepare('SELECT 1 FROM commits WHERE filename = ? LIMIT 1').get(filename);

        // If this is the first commit and old version exists, save it too
        if (!hasPrevCommit && oldVersion) {
          const prevContentFilename = `${timestamp}-${basename}-${prevSha}${ext}`;
          const prevContentPath = path.join(outputDir, prevContentFilename);
          fs.writeFileSync(prevContentPath, oldVersion);

          // Insert a record for the previous version as an initial commit
          const insertPrev = db.prepare('INSERT INTO commits (filename, sha, prev_sha, tool, params, content_path, ts) VALUES (?, ?, ?, ?, ?, ?, ?)');
          insertPrev.run(filename, prevSha, null, null, null, prevContentPath, ts);
        }

        const contentFilename = `${timestamp}-${basename}-${sha}${ext}`;
        const contentPath = path.join(outputDir, contentFilename);

        // Write content to file instead of storing in db
        fs.writeFileSync(contentPath, newVersion);

        const insert = db.prepare('INSERT INTO commits (filename, sha, prev_sha, tool, params, content_path, ts) VALUES (?, ?, ?, ?, ?, ?, ?)');
        insert.run(filename, sha, prevSha, tool, paramsStr, contentPath, ts)
        return `${result}\ncommit: ${prevSha || '∅'} -> ${sha}`

      } catch (e) {
        throw e
      } finally {
        db.close()
      }
    }
  }
}
