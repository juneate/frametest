import puppeteer from "puppeteer";
import sharp from "sharp";

async function processAndEncodeImage(imagePath: string) {
    try {
        // Load the image, trim, and resize
        const processedBuffer = await sharp(imagePath)
            .trim() // Trim transparent borders
            .resize(200) // Resize, maintaining aspect ratio, width set to 200 as an example
            .toBuffer(); // Convert to Buffer for further processing

        // Encode to Base64
        const base64 = processedBuffer.toString("base64");

        // If you need the data URL format (e.g., for embedding in HTML/CSS/JS), include the MIME type
        const mimeType = "image/png"; // Adjust based on your image, or dynamically detect MIME type
        const base64DataUrl = `data:${mimeType};base64,${base64}`;

        return base64DataUrl;
    } catch (error) {
        console.error("Error processing image:", error);
        return null;
    }
}

// return `data:image/${path.extname(fullPath).slice(1)};base64,${fileData.toString('base64')}`;
// }

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 566 });

    /*     // Example usage
    const logos = await Promise.all(
        ["img/logo1.png", "img/logo2.png"].map(
            async (imagePath) => await processAndEncodeImage(imagePath)
        )
    );
 */

    // Example usage
    const imagePath1 = "img/logo1.png";
    const imagePath2 = "img/logo2.png";
    const encodedImages = await resizeAndEncodeImages(imagePath1, imagePath2);

    const logos = [];
    if (encodedImages) {
        logos.push(encodedImages.image1);
        logos.push(encodedImages.image2);
    }

    // For local HTML/CSS, you can use setContent to set the HTML content
    await page.setContent(
        `<!DOCTYPE html>
            <html>
                <head>
                    <style>
                        * {
                            box-sizing: border-box;
                        }
                        html {
                            font-size: 18px;
                        }
                        body {
                            font-family: "Helvetica Neue";
                            margin: 0;
                            font-size: 1rem;
                        }
                        .container {
                            display: flex;
                            flex-direction: column;
                            gap: 45px;
                            padding: 45px;
                            width: 1080px;
                            height: 566px;
                            background-size: 100% 100%;
                            background-position: 0px 0px, 0px 0px, 0px 0px,
                                0px 0px, 0px 0px;
                            background-image: radial-gradient(
                                    49% 81% at 45% 47%,
                                    #e3ff0345 0%,
                                    #6f34ab00 100%
                                ),
                                radial-gradient(
                                    113% 91% at 17% -2%,
                                    #a955baff 1%,
                                    #ff000000 99%
                                ),
                                radial-gradient(
                                    142% 91% at 83% 7%,
                                    #ffce00ff 2%,
                                    #ffc20000 100%
                                ),
                                radial-gradient(
                                    142% 91% at -6% 74%,
                                    #ff0049ff 1%,
                                    #ff000000 99%
                                ),
                                radial-gradient(
                                    142% 91% at 111% 84%,
                                    #9c4694ff 0%,
                                    #401c2fff 100%
                                );
                        }
                        .header {
                            display: flex;
                            gap: 45px;
                        }
                        .logo {
                            height: 100px;
                        }
                        .logo img {
                            height: 100%;
                            width: auto;
                        }
                        h2 {
                            font-size: 1.5rem;
                            text-align: center;
                            font-weight: 900;
                            text-transform: uppercase;
                            position: absolute;
                            top: -0.6em;
                            margin: auto;
                            left: 0;
                            right: 0;
                            font-family: "Arial Black";
                            letter-spacing: -0.03em;
                            line-height: 1;
                        }
                        .carousel {
                            display: grid;
                            grid-template-columns: repeat(3, 1fr);
                            gap: 45px;
                            flex-grow: 1;
                        }
                        .product p:first-of-type {
                            margin-top: 0.5em;
                        }
                        .product :last-child {
                            margin-bottom: 0;
                        }
                        .product {
                            background-color: rgba(240, 240, 240, 15%);
                            border-radius: 15px;
                            padding: 45px;
                            position: relative;
                            display: flex;
                            flex-direction: column;
                            gap: 1rem;
                        }
                        .middle {
                            flex-grow: 1;
                        }
                        ul {
                            padding-left: 0.8em;
                        }
                        li {
                            padding-left: 1e;
                        }
                        footer {
                            font-size: 2.5em;
                            font-family: "Arial Black";
                            text-align: center;
                            line-height: 1;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <header class="header">
                            <div class="logo"><img src="${logos[0]}" /></div>
                            <div class="logo"><img src="${logos[1]}" /></div>
                        </header>
                        <section class="carousel">
                            <article class="product">
                                <h2>Product One</h2>
                                <section class="middle">
                                    <p>
                                        Lorem ipsum dolor sit amet consectetur
                                        adipisicing elit.
                                    </p>
                                    <ul>
                                        <li>Blah blah blah</li>
                                        <li>Blahaahhb</li>
                                        <li>Bing bonggg</li>
                                    </ul>
                                </section>
                                <footer>$49</footer>
                            </article>
                            <article class="product">
                                <h2>Product Two</h2>
                                <section class="middle">
                                    <p>
                                        Lorem ipsum dolor sit amet consectetur
                                        adipisicing elit.
                                    </p>
                                    <ul>
                                        <li>Blah blah blah</li>
                                        <li>Blahaahhb</li>
                                        <li>Bing bonggg</li>
                                    </ul>
                                </section>
                                <footer>$49</footer>
                            </article>
                            <article class="product">
                                <h2>Product Three</h2>
                                <section class="middle">
                                    <p>
                                        Lorem ipsum dolor sit amet consectetur
                                        adipisicing elit.
                                    </p>
                                    <ul>
                                        <li>Blah blah blah</li>
                                        <li>Blahaahhb</li>
                                        <li>Bing bonggg</li>
                                    </ul>
                                </section>
                                <footer>$49</footer>
                            </article>
                        </section>
                    </div>
                </body>
            </html> `,
        { waitUntil: "networkidle0" }
    ); // Ensures all resources are loaded

    // Take a screenshot
    await page.screenshot({ path: "img/test-puppeteer.png" });

    await browser.close();
})();

async function resizeAndEncodeImages(imagePath1: string, imagePath2: string) {
    try {
        // Load the images and get their dimensions
        const metadata1 = await sharp(imagePath1).metadata();
        const metadata2 = await sharp(imagePath2).metadata();

        if (
            !metadata1.width ||
            !metadata2.width ||
            !metadata1.height ||
            !metadata2.height
        )
            return;

        // Calculate the aspect ratios
        const aspectRatio1 = metadata1.width / metadata1.height;
        const aspectRatio2 = metadata2.width / metadata2.height;

        // Using the formula: (aspectRatio1 * height) + (aspectRatio2 * height) = 945
        // Solve for height: height = 945 / (aspectRatio1 + aspectRatio2)
        // Since we're calculating width based on a common height, and the total width is 945px,
        // we directly calculate target widths instead.
        const totalWidth = 945;
        const combinedAspectRatios = aspectRatio1 + aspectRatio2;
        const targetWidth1 = totalWidth * (aspectRatio1 / combinedAspectRatios);
        const targetWidth2 = totalWidth * (aspectRatio2 / combinedAspectRatios);

        // Resize the images
        const resizedBuffer1 = await sharp(imagePath1)
            .resize({ width: Math.round(targetWidth1) })
            .toBuffer();

        const resizedBuffer2 = await sharp(imagePath2)
            .resize({ width: Math.round(targetWidth2) })
            .toBuffer();

        // Base64 encode
        const base64Image1 = resizedBuffer1.toString("base64");
        const base64Image2 = resizedBuffer2.toString("base64");

        // Return the Base64 encoded strings
        return {
            image1: `data:image/png;base64,${base64Image1}`,
            image2: `data:image/png;base64,${base64Image2}`,
        };
    } catch (error) {
        console.error("Error processing images:", error);
        return null;
    }
}
