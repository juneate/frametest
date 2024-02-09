import sharp from "sharp";

const w = 1080;
const h = 1080;

// Assuming `layers` is an array of paths to your transparent PNG images
// and `text` is the text you want to add.
const composeImage = async (layers: any[], text: string) => {
    let compositeLayers = layers.map((layer) => ({ input: layer }));

    // Define a linear gradient in SVG
    const gradientSvg = `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgb(106,188,255);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgb(134,123,249);stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad1)" />
        </svg>
        `;

    // Initialize a sharp instance with the gradient as the base layer
    let baseImage = sharp(Buffer.from(gradientSvg)).resize(1080, 1080);

    const textLayers = [`One`, `Two`, `Three`].map((num, i) => {
        const textSvg = `
            <svg width="300" height="500">
                <rect width="300" height="500" rx="15" fill="#e9e9e9" fill-opacity="0.2"/>
                <text fill="black" xml:space="preserve" style="white-space: pre" font-family="Helvetica Neue" font-size="32" font-weight="bold" letter-spacing="0em"><tspan x="53.9531" y="46.628">Product ${num}</tspan></text>
                <text fill="black" xml:space="preserve" style="white-space: pre" font-family="Helvetica Neue" font-size="18" font-weight="bold" letter-spacing="0em"><tspan x="15" y="92.822">Usage-based billing (i.e. </tspan><tspan x="15" y="114.822">metered billing or consumption </tspan><tspan x="15" y="136.822">billing) is a common pricing </tspan><tspan x="15" y="158.822">model for SaaS businesses </tspan><tspan x="15" y="180.822">that enables companies to </tspan><tspan x="15" y="202.822">charge based on a customer&#x2019;s </tspan><tspan x="15" y="224.822">usage.&#x2028;</tspan><tspan x="15" y="246.822">&#10;</tspan><tspan x="15" y="268.822">With Loop, you can set up and </tspan><tspan x="15" y="290.822">integrate different types of </tspan><tspan x="15" y="312.822">usage-based pricing models. </tspan><tspan x="15" y="334.822">This is because Loop is simply </tspan><tspan x="15" y="356.822">a payment processor - we </tspan><tspan x="15" y="378.822">charge a payment method on </tspan><tspan x="15" y="400.822">file if it exists or provide a </tspan><tspan x="15" y="422.822">checkout link for manual </tspan><tspan x="15" y="444.822">payment.</tspan></text>
            </svg>
        `;
        return {
            input: Buffer.from(textSvg),
            top: 500,
            left: 45 + i * 345,
        };
    });

    // Composite the SVG text onto the gradient background
    baseImage = sharp(await baseImage.composite(textLayers).toBuffer());

    // Process each layer: resize it by width while maintaining aspect ratio, and create a composite object
    const processedLayers = await Promise.all(
        layers.map(async (layer) => {
            const resizedLayerBuffer = await sharp(layer.path)
                .trim()
                .resize(layer.width) // Only specify the width
                .toBuffer();
            return {
                input: resizedLayerBuffer,
                left: layer.x,
                top: layer.y,
            };
        })
    );

    // Composite all layers on top of the base image
    await baseImage.composite(processedLayers).toFile("img/test_1080x1080.png");

    /*     await sharp(Buffer.from(gradientSvg))
        .composite(layers.map((layer) => ({ input: layer })))
        .toFile("final_composite_image.png"); */
};

// Example usage
// Example layers with their desired sizes and positions
const layers = [
    { path: "img/logo1.png", width: 800, x: (w - 800) / 2, y: 100 },
    { path: "img/logo2.png", width: 800, x: (w - 800) / 2, y: 250 },
];
const text =
    "Here's some dynamic text! lorem ipsum dolor sit amet. lorem ipsum dolor sit amet. lorem ipsum dolor sit amet. lorem ipsum dolor sit amet. lorem ipsum dolor sit amet.";
composeImage(layers, text).catch(console.error);
