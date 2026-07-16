const sharp = require('sharp');

module.exports = async function correct_color({ filename, color }, ctx) {
    if (!color) {
        throw new Error("Color parameter is required");
    }

    // Parse target color
    const hex = color.startsWith('#') ? color.slice(1) : color;
    let targetR, targetG, targetB;

    if (hex.length === 3) {
        targetR = parseInt(hex[0] + hex[0], 16);
        targetG = parseInt(hex[1] + hex[1], 16);
        targetB = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        targetR = parseInt(hex.substring(0, 2), 16);
        targetG = parseInt(hex.substring(2, 4), 16);
        targetB = parseInt(hex.substring(4, 6), 16);
    } else {
        throw new Error(`Invalid color format: ${color}. Use hex like #ffffff or #fff`);
    }

    // Read input into buffer first (can't read and write same file simultaneously)
    const inputBuffer = await sharp(filename).toBuffer();

    // Process image
    const image = sharp(inputBuffer);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Tolerance for color matching
    const tolerance = 40;

    // Correct colors
    const totalPixels = data.length / 4;
    let correctedPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if color is close to target
        if (Math.abs(r - targetR) <= tolerance &&
            Math.abs(g - targetG) <= tolerance &&
            Math.abs(b - targetB) <= tolerance) {
            // Replace with exact target color
            data[i] = targetR;
            data[i + 1] = targetG;
            data[i + 2] = targetB;
            correctedPixels++;
        }
    }

    // Save result back to same file
    await sharp(data, {
        raw: info
    }).toFile(filename);

    const pct = ((correctedPixels / totalPixels) * 100).toFixed(1);
    return `${pct}% of pixels color corrected`;
};