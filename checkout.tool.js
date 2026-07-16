const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const hash = (content) => crypto
  .createHash('sha1')
  .update(content)
  .digest('base64url');

module.exports = async function checkout({ sha, filename, output }, ctx) {
  if (!sha) {
    throw Error("checkout: 'sha' is required");
  }

  const outputDir = output || '.commits';
  const dbFile = path.join(outputDir, 'db.sqlite');

  if (!fs.existsSync(dbFile)) {
    throw Error(`checkout: database not found at ${dbFile}`);
  }

  const db = new DatabaseSync(dbFile);

  try {
    // Find the commit by sha
    const row = db.prepare('SELECT * FROM commits WHERE sha = ?').get(sha);
    if (!row) {
      throw Error(`checkout: no commit found with sha '${sha}'`);
    }

    if (!row.content_path) {
      throw Error(`checkout: commit '${sha}' has no content_path`);
    }

    if (!fs.existsSync(row.content_path)) {
      throw Error(`checkout: content file not found at ${row.content_path}`);
    }

    const content = fs.readFileSync(row.content_path);

    // Determine target filename: use provided filename or fall back to DB record
    const targetFilename = filename || row.filename;

    // Get previous version hash before overwriting
    let prevSha = null;
    try {
      const oldContent = await ctx.read(targetFilename, true);
      if (oldContent) {
        prevSha = hash(oldContent);
      }
    } catch (e) {
      // File might not exist yet, prevSha stays null
    }

    // Write content to target filename
    await ctx.write(targetFilename, content);

    // Insert checkout record into commits table
    const ts = Date.now();
    const insert = db.prepare(
      'INSERT INTO commits (filename, sha, prev_sha, tool, params, content_path, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insert.run(targetFilename, sha, prevSha, 'checkout', JSON.stringify({ sha, filename: targetFilename }), row.content_path, ts);

    return `checked out ${sha} to ${targetFilename}`;
  } finally {
    db.close();
  }
};
