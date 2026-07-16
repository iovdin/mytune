const sharp = require('sharp');

module.exports = async function autocrop({ filename }, ctx) {
    // Read input into buffer first (can't read and write same file simultaneously)
    const inputBuffer = await sharp(filename).toBuffer();

    // Process image to get raw pixel data
    const { data, info } = await sharp(inputBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height } = info;

    // Find bounding box of non-transparent pixels
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const alpha = data[i + 3];

            if (alpha > 0) { // Non-transparent pixel
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    // If no non-transparent pixels found, return original
    if (minX > maxX || minY > maxY) {
        return `no content to crop`;
    }

    // Add 1px padding to avoid cutting off anti-aliased edges
    const left = Math.max(0, minX - 1);
    const top = Math.max(0, minY - 1);
    const right = Math.min(width, maxX + 2);
    const bottom = Math.min(height, maxY + 2);

    // Crop the image and save back to same file
    const newWidth = right - left;
    const newHeight = bottom - top;
    await sharp(inputBuffer)
        .extract({
            left: left,
            top: top,
            width: newWidth,
            height: newHeight
        })
        .toFile(filename);

    return `${width}x${height} -> ${newWidth}x${newHeight}`;
};