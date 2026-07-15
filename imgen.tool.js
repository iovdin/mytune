const path = require('path');

function fmt(num) {
  if (num == null) return '0';
  if (num < 1000) {
    return num.toString();
  }
  const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const tier = Math.log10(Math.abs(num)) / 3 | 0;
  if (tier === 0) return num.toString();
  const suffix = suffixes[tier];
  const scale = Math.pow(10, tier * 3);
  const scaled = num / scale;
  return scaled.toFixed(scaled < 10 && scaled >= 1 ? 1 : 0) + suffix;
}

module.exports = async function imgen({ text, filename, images, quality,  model, aspect_ratio, resolution, output_format, n, background }, ctx) {
  const key = await ctx.read('OPENROUTER_KEY');

  // Default model — can be overridden by the caller
  const useModel = model || 'openai/gpt-image-2';

  const body = {
    model: useModel,
    prompt: text,
    aspect_ratio: aspect_ratio || 'auto',
  };

  if (quality) body.quality = quality;          // auto, low, medium, high
  if (resolution) body.resolution = resolution;  // 512, 1K, 2K, 4K
  if (output_format) body.output_format = output_format;  // png, jpeg, webp, svg
  body.n = 1;
  body.background = "opaque";  // auto, transparent, opaque

  // If reference images are provided, convert to base64 data URLs
  if (images && images.length > 0) {
    body.input_references = [];
    for (let i = 0; i < images.length; i++) {
      const imageContent = await ctx.read(images[i]);
      const ext = path.extname(images[i]).toLowerCase();
      let mimeType = 'application/octet-stream';
      switch (ext) {
        case '.png':
          mimeType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        case '.webp':
          mimeType = 'image/webp';
          break;
      }
      const base64 = Buffer.isBuffer(imageContent)
        ? imageContent.toString('base64')
        : Buffer.from(imageContent).toString('base64');
      body.input_references.push({
        "image_url": {
          "url": `data:${mimeType};base64,${base64}`
        },
        "type": "image_url"
      })
    }
  }

  const headers = {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return await response.text();
  }

  const res = await response.json();

  // Response: { created, data: [ { b64_json } ], usage: {...} }
  const data = res.data[0].b64_json;
  await ctx.write(filename, Buffer.from(data, 'base64'));

  // Print cost and token usage similar to usage.proc.js
  const { usage } = res;
  if (usage) {
    const { prompt_tokens, completion_tokens, cost } = usage;
    let cents = cost ? `${(cost * 100).toFixed(2)}¢` : '';
    return `image generated\n\n---\n↑${fmt(prompt_tokens)} ↓${fmt(completion_tokens)} ${cents}\n---`;
  }
  return 'image generated';
}
