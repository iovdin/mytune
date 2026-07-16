const sharp = require('sharp');

module.exports = async function remove_background({ filename, color = '#ffffff' }, ctx) {
    // Parse hex color to RGB
    const hex = color.startsWith('#') ? color.slice(1) : color;
    let r, g, b;

    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        throw new Error(`Invalid color format: ${color}. Use hex like #ffffff or #fff`);
    }

    // Read input into buffer first (can't read and write same file simultaneously)
    const inputBuffer = await sharp(filename).toBuffer();

    // Process image
    const image = sharp(inputBuffer);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Replace color with transparency
    const tolerance = 40;
    const totalPixels = data.length / 4;
    let removedPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - r) <= tolerance &&
            Math.abs(data[i + 1] - g) <= tolerance &&
            Math.abs(data[i + 2] - b) <= tolerance) {
            data[i + 3] = 0; // Set alpha to 0 (transparent)
            removedPixels++;
        }
    }

    // Save result back to same file
    await sharp(data, {
        raw: info
    }).toFile(filename);

    const pct = ((removedPixels / totalPixels) * 100).toFixed(1);
    return `${pct}% of pixels made transparent`;
};
