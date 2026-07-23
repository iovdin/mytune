const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  parseArgs,
  stripAssistantStatusData,
  appendAssistantStatusData,
} = require("./utils.js");

const cachePath = path.resolve(
  os.homedir(),
  ".tune/node_modules/tune-models/src/.cache/openrouter_models.json"
);

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseDurationMs(value) {
  if (value == null) return null;
  const str = String(value).trim().toLowerCase();
  const match = str.match(/^([0-9]*\.?[0-9]+)\s*([smhdwymy]?)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2] || "ms";
  if (!Number.isFinite(amount)) return null;

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    mo: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };

  if (unit === "m") return amount * multipliers.m;
  if (unit === "y") return amount * multipliers.y;
  return multipliers[unit] ? amount * multipliers[unit] : null;
}

function normalizeList(value) {
  if (value == null) return [];
  return String(value)
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function getPerMillionPrice(model) {
  const prompt = parseNumber(model?.pricing?.prompt);
  if (prompt == null) return null;
  return prompt * 1000000;
}

module.exports = async function randomModel(node, args, ctx) {
  if (!node) return;
  if (node.type !== "llm") {
    throw Error(`random_model expects 'llm' type got '${node.type}'`);
  }
  if (node.source !== "openrouter") {
    throw Error(`random_model expects 'openrouter' source got '${node.source}'`);
  }

  if (!fs.existsSync(cachePath)) {
    throw Error(
      `random_model need list of openrouter models in file ${cachePath} but it does not exist`
    );
  }

  const params = parseArgs(args || "");
  const requiredInputs = normalizeList(params.input);
  const maxPricing = parseNumber(params.pricing);
  const maxAgeMs = parseDurationMs(params.created);
  const prefix = params.prefix ? String(params.prefix).trim().toLowerCase() : null;
  const n = params.n || 1;
  const now = Date.now();

  /*
  Supported filters:
  - input=text,image      required input modalities
  - pricing=0.3          max prompt price per 1M tokens
  - created=3m           max age, e.g. 3d 3w 3m 1y
  - prefix=mistralai     model id prefix
  - n=1,3,tune           for how long keep model choice
  */

  const models = JSON.parse(fs.readFileSync(cachePath, "utf8")).filter(model => {
    if (!model?.architecture?.input_modalities?.includes("text")) return false;
    if (!model?.supported_parameters?.includes("tools")) return false;

    if (requiredInputs.length) {
      const inputs = (model.architecture.input_modalities || []).map(item =>
        String(item).toLowerCase()
      );
      if (!requiredInputs.every(input => inputs.includes(input))) return false;
    }

    if (maxPricing != null) {
      const pricePerMillion = getPerMillionPrice(model);
      if (pricePerMillion == null || pricePerMillion > maxPricing) return false;
    }

    if (maxAgeMs != null) {
      const createdMs = Number(model.created) * 1000;
      if (!Number.isFinite(createdMs) || now - createdMs > maxAgeMs) return false;
    }

    if (prefix) {
      const id = String(model.id || "").toLowerCase();
      if (!id.startsWith(`${prefix}/`) && !id.startsWith(prefix)) return false;
    }

    return true;
  });

  if (!models.length) {
    throw Error(
      `random_model found no openrouter models matching filters: ${args || "<none>"}`
    );
  }

  const model = models[Math.floor(Math.random() * models.length)];
  let last = { turns: 0};
  const { result2msg } = node;

  return {
    ...node,
    exec: async (payload, ctx) => {
      const { messages = [] } = payload;
      messages.forEach(msg => {
        if (msg.role === "assistant") {
          const { status, content } = stripAssistantStatusData(msg.content || "");
          // now lets parse status to look for a model used in the last assistant message
          const m = status.match(/^@(.*)$/m);
          if (m?.[1]) {
            if (last.model != m?.[1]) {
              last.model = m?.[1];
              last.turns = 0;
            } 
            last.turns++;
          }
          msg.content = content 
          last.endTurn = !msg?.tool_calls?.length 
        }
      });

      if (n === "turn" && last.endTurn) {
        last.model = model.id
      } else if (n <= last.turns) {
        last.model = model.id
        last.turns = 0;
      } else if (!last.model) {
        last.model = model.id
      }

      return node.exec(
        {
          ...payload,
          model: last.model,
        },
        ctx
      );
    },
    result2msg: (result, msg) => {
      msg = result2msg(result, msg);
      msg.content = appendAssistantStatusData(msg.content, `@${last.model}`);
      return msg;
    },
  };
};
