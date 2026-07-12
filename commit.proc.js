const { DatabaseSync } = require('node:sqlite');
// const zlib = require('zlib');
const crypto = require('crypto');

const hash = (content) => crypto
  .createHash('sha1')
  .update(content)
  .digest('base64url');

module.exports = async function commit(node, args, ctx) {
  if (!node) return
  if (node.type !== "tool") {
    throw Error(`commit processor accepts only 'tool' nodes, got ${node.typ}`)
  }

  const dbFile = args.trim() || `.commits.sqlite`

  return {
    ...node,
    exec: async function exec(params , ctx) {
      const { filename } = params;
      if (!filename) {
        throw Error(`'filename' is not passed for tool ${node.name}`);
      }
      let oldVersion = await ctx.read(filename);
      const result = await node.exec.call(this, params, ctx)
      let newVersion = await ctx.read(filename);
      if (!newVersion) {
        throw Error(`commit: file content is empty ${filename}`);
      }
      
      const db = new DatabaseSync(dbFile);

      const message = "TODO"
      try {
        const prevSha = oldVersion ? hash(oldVersion) : null;
        const sha = hash(newVersion)
        // oldVersion = oldVersion ? zlib.gzipSync(oldVersion) : null;
        //  newVersion = zlib.gzipSync(newVersion);

        db.exec(`CREATE TABLE IF NOT EXISTS commits (
id INTEGER PRIMARY KEY AUTOINCREMENT,
filename TEXT NOT NULL,
sha TEXT NOT NULL,
prev_sha TEXT,
message TEXT NOT NULL,
content TEXT,
ts INTEGER NOT NULL
)`);

        const insert = db.prepare('INSERT INTO commits (filename, sha, prev_sha, message, content, ts) VALUES (?, ?, ?, ?, ?, ?)');
        insert.run(filename, sha, prevSha, message, newVersion, Date.now())
        return `${result}\ncommit: ${sha}`

      } catch (e) {
        throw e
      } finally {
        db.close()
      }

      return result
    }
  }
}
