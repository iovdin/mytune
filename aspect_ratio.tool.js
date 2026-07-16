const sharp = require('sharp');

module.exports = async function aspect_ratio({ filename, ratio = '1:1', padding = 0, align = 'center center' }, ctx) {
    // Read input into buffer first (can't read and write same file simultaneously)
    const inputBuffer = await sharp(filename).toBuffer();

    // Parse target aspect ratio
    const [ratioW, ratioH] = ratio.split(':').map(Number);
    const targetRatio = ratioW / ratioH;
    
    // Get original image dimensions
    const { width: origWidth, height: origHeight } = await sharp(inputBuffer).metadata();
    const imageRatio = origWidth / origHeight;
    
    // Calculate canvas dimensions to fit target ratio while containing original image
    let canvasWidth, canvasHeight;
    if (imageRatio > targetRatio) {
        // Image is wider than target ratio - increase height
        canvasWidth = origWidth;
        canvasHeight = Math.round(origWidth / targetRatio);
    } else {
        // Image is taller than target ratio - increase width
        canvasWidth = Math.round(origHeight * targetRatio);
        canvasHeight = origHeight;
    }
    
    // Add padding
    const totalWidth = canvasWidth + padding * 2;
    const totalHeight = canvasHeight + padding * 2;
    
    // Parse alignment
    const [horizontal, vertical] = align.split(' ');
    
    // Calculate offsets based on alignment
    let left, top;
    switch (horizontal) {
        case 'left': left = padding; break;
        case 'right': left = totalWidth - origWidth - padding; break;
        default: left = Math.round((totalWidth - origWidth) / 2); // center
    }
    
    switch (vertical) {
        case 'top': top = padding; break;
        case 'bottom': top = totalHeight - origHeight - padding; break;
        default: top = Math.round((totalHeight - origHeight) / 2); // center
    }
    
    // Create transparent canvas and composite original image without stretching
    await sharp({
        create: {
            width: totalWidth,
            height: totalHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
    .composite([{
        input: inputBuffer,
        left: left,
        top: top,
        blend: 'over'
    }])
    .toFile(filename);
    
    return `${origWidth}x${origHeight} -> ${totalWidth}x${totalHeight}`;
};