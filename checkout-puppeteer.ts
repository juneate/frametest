import puppeteer, { Page, Browser } from "puppeteer";
import Jimp from "jimp";
type ImageSize = { width: number; height: number };

const strToBase64 = (base64: string, mimeType: string): string => {
    return `data:${mimeType};base64,${base64}`;
};

const isAbsolutePath = (imagePath: string): boolean =>
    imagePath.trim().startsWith("http://") ||
    imagePath.trim().startsWith("https://");

const fetchImage = async (imagePath: string): Promise<Buffer> => {
    return await fetch(imagePath).then(async (res) => {
        if (res.ok) return Buffer.from(await res.arrayBuffer());
        throw new Error(`Failed to fetch image`);
    });
};

const processAndEncodeImage = async (
    imagePath: string
): Promise<{ encodedImg: string; metadata: ImageSize }> => {
    try {
        const image = await Jimp.read(imagePath);

        //const resizedImage = await image.resize(width, height);
        const encodedImg = await image.getBase64Async(Jimp.MIME_PNG);

        console.log(encodedImg);

        return {
            encodedImg,
            metadata: {
                width: image.bitmap.width,
                height: image.bitmap.height,
            },
        };
    } catch (error) {
        throw new Error(`Error processing image:\n${error}`);
    }

    /*     try {
        const imageAtPath = isAbsolutePath(imagePath)
            ? await fetchImage(imagePath).catch((error) => {
                  throw new Error(
                      `Could not fetch image at location ${imagePath}:\n${error}`
                  );
              })
            : imagePath;
        const image = sharp(imageAtPath).trim();
        const processedBuffer = await image.toBuffer();
        const metadata = await image.metadata();

        const base64 = processedBuffer.toString("base64");
        const encodedImg = strToBase64(base64, `image/png`);

        return { encodedImg, metadata };
     */
};

const encodedImageToFile = async (encodedImage: string, fileName: string) => {
    // Strip off the data URL prefix to get just the Base64-encoded bytes
    const data = encodedImage.replace(/^data:image\/\w+;base64,/, "");

    try {
        // Convert the Base64 string to a buffer
        const imageBuffer = Buffer.from(data, "base64");

        // Read the image from the buffer
        const image = await Jimp.read(imageBuffer);

        // Save the image to a file
        await image.writeAsync(fileName);

        console.log(`Image saved to ${fileName}`);
    } catch (error) {
        throw new Error(`Error saving the image to "${fileName}"\n${error}`);
    }

    /* 
    // Strip off the data URL prefix to get just the Base64-encoded bytes
    const data = encodedImage.split(",")[1];

    // Convert the Base64 string to a buffer
    const imageBuffer = Buffer.from(data, "base64");

    // Save the buffer as an image file
    return await sharp(imageBuffer)
        .toFile(fileName)
        .catch((error) => {
            throw new Error(
                `Error saving the image to "${fileName}"\n${error}`
            );
        }); */
};

const launchHeadlessBrowser = async (
    imgSize: ImageSize
): Promise<{ page: Page; browser: Browser }> => {
    // Launch a headless browser
    return await puppeteer
        .launch()
        .then(async (browser) => {
            const page = await browser.newPage();
            await page.setViewport(imgSize);
            return { page, browser };
        })
        .catch((error) => {
            throw new Error(
                `Error starting Puppeteer browser (${imgSize.width}x${imgSize.height})\n${error}`
            );
        });
};

const pageToBase64 = async (
    page: Page,
    mimeType: string = `image/png`
): Promise<string> => {
    // Screenshot the layout as a base64 encoded string
    return await page
        .screenshot({ encoding: "base64" })
        .then((img) => {
            return strToBase64(img, mimeType);
        })
        .catch((error) => {
            throw new Error(`Error encoding screenshot\n${error}`);
        });
};

const buildCheckoutBase64Image = async (
    logoUrl: string,
    imgSize: ImageSize = { width: 1080, height: 566 }
): Promise<string> => {
    // Base64 encode the image
    const { encodedImg, metadata } = await processAndEncodeImage(logoUrl).catch(
        (error) => {
            throw new Error(`Logo was not encoded\n${error}`);
        }
    );

    const { page, browser } = await launchHeadlessBrowser(imgSize).catch(
        (error) => {
            throw new Error(`Headless browser was not launched\n${error}`);
        }
    );

    // Set the checkout layout
    try {
        await page.setContent(
            checkoutLogoOnlyLayout(
                encodedImg,
                metadata.width! > metadata.height!
            ),
            {
                waitUntil: "networkidle0",
            }
        );
    } catch (error) {
        throw new Error(`Checkout layout was not built\n${error}`);
    }

    // Screenshot the layout as a base64 encoded string
    const encodedLayout = await pageToBase64(page, `image/png`).catch(
        (error) => {
            throw new Error(`Screenshot not converted to base64\n${error}`);
        }
    );

    await browser.close();
    return encodedLayout;
};

const checkoutLogoOnlyLayout = (encodedLogo: string, wide: boolean): string => {
    return `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
                <link
                    href="https://fonts.googleapis.com/css2?family=Poppins:wght@500&display=swap"
                    rel="stylesheet"
                />
                <title>Checkout powered by LoopCrypto</title>
                <style>
                    * {
                        box-sizing: border-box;
                    }
                    body {
                        background: #eee;
                        color: #333;
                        margin: 0;
                        font-family: Poppins, sans-serif;
                    }
                    .container {
                        --footer-height: 3rem;
                        --gap: 2rem;
                        background-color: #fff;
                        width: 1080px;
                        height: 566px;
                        padding: 4rem 4rem 2.5rem;
                        display: grid;
                        gap: var(--gap);
                        grid-template-rows:
                            calc(100% - var(--gap) - var(--footer-height))
                            var(--footer-height);
                    }
                    .logo {
                        place-content: center;
                        height: 100%;
                        width: 100%;
                        padding: 2rem 4rem 2.5rem;
                    }
                    .logo.wide {
                        padding: 5rem 4rem 2rem;
                    }
                    .logo img {
                        object-fit: contain;
                        height: 100%;
                        width: 100%;
                    }
                    .footer {
                        font-size: 1.25rem;
                        display: grid;
                        grid-template-columns: auto auto;
                        gap: 1.5rem;
                        align-items: end;
                        justify-content: end;
                    }
                    .powered {
                        text-transform: uppercase;
                        letter-spacing: 0.25em;
                        padding-bottom: 0.35rem;
                    }
                    .loop {
                        height: var(--footer-height);
                    }
                    .loop svg {
                        object-fit: contain;
                        height: 100%;
                        width: auto;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <header>
                        <div class="logo ${wide ? ` wide` : ``}">
                            <img src="${encodedLogo}" alt="Logo" />
                        </div>
                    </header>
                    <footer class="footer">
                        <span class="powered">Checkout powered by</span
                        ><span class="loop"
                            ><svg
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 75 14"
                        >
                            <path
                                d="M34.652 10.26c-2.127 0-3.818-1.504-3.818-3.754s1.645-3.754 3.756-3.754c1.753 0 3.197 1.06 3.508 2.521l-1.366.402c-.124-1.032-1.008-1.805-2.142-1.805-1.366 0-2.422 1.09-2.422 2.636 0 1.547 1.056 2.608 2.422 2.608 1.18 0 2.11-.745 2.204-1.891l1.428.401c-.28 1.548-1.77 2.636-3.57 2.636ZM39.76 2.924h1.055l.156 1.19c.373-.832 1.117-1.361 2.018-1.361.31 0 .605.072.869.171l-.062 1.348a2.033 2.033 0 0 0-.931-.23c-1.087 0-1.863.803-1.863 1.92v4.127H39.76V2.925ZM46.464 2.924l2.266 5.502 2.111-5.502h1.428l-3.415 8.195c-.48 1.147-1.335 1.892-2.39 2.006l-.341-1.204c.683-.057 1.21-.372 1.49-1.032l.434-1.031-3.042-6.935h1.46v.001ZM54.66 8.885v4.07h-1.243V2.924h1.056l.156 1.204c.59-.86 1.551-1.375 2.763-1.375 2.08 0 3.694 1.548 3.694 3.725s-1.692 3.782-3.694 3.782c-1.164 0-2.127-.516-2.732-1.375v-.001Zm2.545.229c1.49 0 2.576-1.09 2.576-2.608 0-1.519-1.086-2.636-2.576-2.636s-2.576 1.104-2.576 2.636 1.086 2.608 2.576 2.608ZM61.83 2.924h.498c.48 0 .838-.372.838-.888V1.09h1.18v1.834h1.707v1.118h-1.707v4.154c0 .53.42.889 1.056.889.218 0 .465-.03.651-.087l.032 1.147a3.326 3.326 0 0 1-.869.114c-1.258 0-2.11-.73-2.11-1.834V4.041h-1.273V2.923l-.002.001ZM67.202 6.507c0-2.178 1.63-3.754 3.88-3.754s3.88 1.576 3.88 3.754-1.63 3.754-3.88 3.754-3.88-1.576-3.88-3.754Zm3.88 2.608c1.49 0 2.576-1.09 2.576-2.608 0-1.519-1.087-2.636-2.576-2.636-1.49 0-2.576 1.104-2.576 2.636s1.086 2.608 2.576 2.608ZM2.894.346v9.742H.722V.346h2.172ZM4.074 6.507c0-2.178 1.661-3.754 3.942-3.754s3.942 1.576 3.942 3.754-1.66 3.754-3.942 3.754c-2.28 0-3.942-1.576-3.942-3.754Zm3.942 1.834c.994 0 1.707-.774 1.707-1.849 0-1.074-.714-1.848-1.707-1.848-.993 0-1.707.774-1.707 1.848 0 1.075.714 1.849 1.707 1.849ZM12.86 6.507c0-2.178 1.66-3.754 3.942-3.754 2.28 0 3.942 1.576 3.942 3.754s-1.662 3.754-3.942 3.754c-2.281 0-3.942-1.576-3.942-3.754Zm3.942 1.834c.994 0 1.707-.774 1.707-1.849 0-1.074-.715-1.848-1.707-1.848-.993 0-1.708.774-1.708 1.848 0 1.075.715 1.849 1.708 1.849ZM24.035 9.157v3.797h-2.172V2.925h1.676l.373.918c.56-.688 1.382-1.09 2.36-1.09 1.955 0 3.384 1.562 3.384 3.698 0 2.135-1.381 3.811-3.259 3.811-.946 0-1.769-.415-2.36-1.104h-.002Zm1.707-.845c.994 0 1.708-.76 1.708-1.82s-.715-1.819-1.707-1.819c-.993 0-1.708.76-1.708 1.82s.715 1.819 1.707 1.819Z"
                                fill="#555"
                            />
                        </svg></span>
                    </footer>
                </div>
            </body>
        </html>`;
};

(async () => {
    // Build the checkout image
    const test = await buildCheckoutBase64Image(
        "img/logo2.png",
        // "img/logo1.png",
        {
            width: 1080,
            height: 566,
        }
    ).catch((error) => {
        throw new Error(`Could not build the checkout frame image\n${error}`);
    });

    console.log(test);

    try {
        await encodedImageToFile(test, "img/checkout.png");
    } catch (error) {
        throw new Error(`Could not save the image\n${error}`);
    }
})();
