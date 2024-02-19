import { readFile, writeFile } from "fs/promises";
import Jimp from "jimp";
import satori from "satori";
type ImageSize = { width: number; height: number };

const formatBase64Str = (base64: string, mimeType: string): string => {
    return `data:${mimeType};base64,${base64}`;
};

const svgToBase64 = (svgString: string): string => {
    return Buffer.from(svgString).toString("base64");
};

const isAbsolutePath = (imagePath: string): boolean =>
    imagePath.trim().startsWith("http://") ||
    imagePath.trim().startsWith("https://");

const fetchToBuffer = async (imagePath: string): Promise<Buffer> => {
    return await fetch(imagePath).then(async (res) => {
        if (res.ok) return Buffer.from(await res.arrayBuffer());
        throw new Error(`Failed to fetch image`);
    });
};

const fileToBuffer = async (fontPath: string): Promise<Buffer> => {
    return await (isAbsolutePath(fontPath)
        ? fetchToBuffer(fontPath)
        : readFile(fontPath));
};

// [ ] Trim images
// [ ] Handle SVG images

const getSvgDimensions = (svgString: string): ImageSize => {
    // Regular expression to match width and height attributes
    const sizeRegex =
        /<svg[^>]*(?:width="(\d+(?:\.\d+)?)(?:px)?")[^>]*(?:height="(\d+(?:\.\d+)?)(?:px)?")[^>]*>/;
    // Regular expression to match the viewBox attribute
    const viewBoxRegex = /<svg[^>]*viewBox="(\d+ \d+ (\d+) (\d+))"[^>]*>/;

    // Attempt to match the width and height attributes first
    const sizeMatch = svgString.match(sizeRegex);
    if (sizeMatch && sizeMatch[1] && sizeMatch[2]) {
        return {
            width: parseFloat(sizeMatch[1]),
            height: parseFloat(sizeMatch[2]),
        };
    }

    // If width and height aren't found, attempt to match the viewBox
    const viewBoxMatch = svgString.match(viewBoxRegex);
    if (viewBoxMatch && viewBoxMatch[2] && viewBoxMatch[3]) {
        return {
            width: parseFloat(viewBoxMatch[2]),
            height: parseFloat(viewBoxMatch[3]),
        };
    }

    // Return 0 if neither attribute is found
    return { width: 0, height: 0 };
};

const trimTransparentPixels = async (image: Jimp): Promise<Jimp> => {
    let minX = image.bitmap.width;
    let minY = image.bitmap.height;
    let maxX = 0;
    let maxY = 0;

    image.scan(
        0,
        0,
        image.bitmap.width,
        image.bitmap.height,
        function (x, y, idx) {
            const alpha = this.bitmap.data[idx + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    );

    if (minX < maxX && minY < maxY) {
        return await image.crop(minX, minY, maxX - minX + 1, maxY - minY + 1);
    }

    // Return the original image if no trimming is needed
    return image;
};

const processAndEncodeImage = async (
    imagePath: string
): Promise<{ encodedImg: string; metadata: ImageSize }> => {
    try {
        if (imagePath.toLowerCase().endsWith(`.svg`)) {
            const svgString = await readFile(imagePath, `utf-8`);

            // Get the height and width of the SVG, from the <svg> tag, or from the viewBox attribute
            return {
                encodedImg: formatBase64Str(
                    svgToBase64(svgString),
                    `image/svg+xml`
                ),
                metadata: getSvgDimensions(svgString),
            };
        }

        // Read the image and trim transparent pixels from the outside
        const image = await trimTransparentPixels(await Jimp.read(imagePath));

        const encodedImg = await image.getBase64Async(Jimp.MIME_PNG);

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
};

const base64ToFile = async (encodedImage: string, fileName: string) => {
    // Strip off the data URL prefix to get just the Base64-encoded bytes
    const data = encodedImage.replace(/^data:image\/[^;]+;base64,/, "");

    try {
        // Convert the Base64 string to a buffer
        const imageBuffer = Buffer.from(data, "base64");

        if (encodedImage.startsWith("data:image/svg")) {
            // Convert the Buffer back to a string
            const decodedSvgString = imageBuffer.toString(`utf-8`);

            // Save the string to a file
            await writeFile(fileName, decodedSvgString);
        } else {
            // Read the image from the buffer
            const image = await Jimp.read(imageBuffer);

            // Save the image to a file
            await image.writeAsync(fileName);
        }
    } catch (error) {
        throw new Error(`Error saving the image to "${fileName}"\n${error}`);
    }
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

    const svg = await satori(
        <div
            style={{
                fontFamily: `Poppins, sans-serif`,
                color: `#333`,
                backgroundColor: `#fff`,
                width: `${imgSize.width}px`,
                height: `${imgSize.height}px`,
                padding: `4rem 4rem 2.5rem`,
                display: `flex`,
                flexDirection: `column`,
                gap: `2rem`,
                gridTemplateRows: `1fr 3rem`,
            }}
        >
            <header
                style={{
                    height: `382px`,
                    width: `100%`,
                    padding:
                        metadata.width > metadata.height
                            ? `5rem 4rem 2rem`
                            : `2rem 4rem 2.5rem`,
                }}
            >
                <img
                    src={encodedImg}
                    alt="Logo"
                    style={{
                        objectFit: `contain`,
                        height: `100%`,
                        width: `100%`,
                    }}
                />
            </header>
            <footer
                style={{
                    fontSize: `1.25rem`,
                    display: `flex`,
                    gap: `1.5rem`,
                    alignItems: `flex-end`,
                    justifyContent: `flex-end`,
                    height: `3rem`,
                    width: `100%`,
                }}
            >
                <div
                    style={{
                        display: `flex`,
                        alignItems: `flex-end`,
                        justifyContent: `flex-end`,
                        textTransform: `uppercase`,
                        letterSpacing: `0.25em`,
                        paddingBottom: `0.2rem`,
                        height: `100%`,
                        width: `auto`,
                        flexGrow: `1`,
                    }}
                >
                    Checkout powered by
                </div>
                <div
                    style={{
                        display: `flex`,
                        height: `3rem`,
                        width: `257px`,
                        flexGrow: `0`,
                        flexShrink: `1`,
                    }}
                >
                    <svg
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 75 14"
                        style={{
                            objectFit: `contain`,
                            height: `100%`,
                            width: `100%`,
                        }}
                    >
                        <path
                            d="M34.652 10.26c-2.127 0-3.818-1.504-3.818-3.754s1.645-3.754 3.756-3.754c1.753 0 3.197 1.06 3.508 2.521l-1.366.402c-.124-1.032-1.008-1.805-2.142-1.805-1.366 0-2.422 1.09-2.422 2.636 0 1.547 1.056 2.608 2.422 2.608 1.18 0 2.11-.745 2.204-1.891l1.428.401c-.28 1.548-1.77 2.636-3.57 2.636ZM39.76 2.924h1.055l.156 1.19c.373-.832 1.117-1.361 2.018-1.361.31 0 .605.072.869.171l-.062 1.348a2.033 2.033 0 0 0-.931-.23c-1.087 0-1.863.803-1.863 1.92v4.127H39.76V2.925ZM46.464 2.924l2.266 5.502 2.111-5.502h1.428l-3.415 8.195c-.48 1.147-1.335 1.892-2.39 2.006l-.341-1.204c.683-.057 1.21-.372 1.49-1.032l.434-1.031-3.042-6.935h1.46v.001ZM54.66 8.885v4.07h-1.243V2.924h1.056l.156 1.204c.59-.86 1.551-1.375 2.763-1.375 2.08 0 3.694 1.548 3.694 3.725s-1.692 3.782-3.694 3.782c-1.164 0-2.127-.516-2.732-1.375v-.001Zm2.545.229c1.49 0 2.576-1.09 2.576-2.608 0-1.519-1.086-2.636-2.576-2.636s-2.576 1.104-2.576 2.636 1.086 2.608 2.576 2.608ZM61.83 2.924h.498c.48 0 .838-.372.838-.888V1.09h1.18v1.834h1.707v1.118h-1.707v4.154c0 .53.42.889 1.056.889.218 0 .465-.03.651-.087l.032 1.147a3.326 3.326 0 0 1-.869.114c-1.258 0-2.11-.73-2.11-1.834V4.041h-1.273V2.923l-.002.001ZM67.202 6.507c0-2.178 1.63-3.754 3.88-3.754s3.88 1.576 3.88 3.754-1.63 3.754-3.88 3.754-3.88-1.576-3.88-3.754Zm3.88 2.608c1.49 0 2.576-1.09 2.576-2.608 0-1.519-1.087-2.636-2.576-2.636-1.49 0-2.576 1.104-2.576 2.636s1.086 2.608 2.576 2.608ZM2.894.346v9.742H.722V.346h2.172ZM4.074 6.507c0-2.178 1.661-3.754 3.942-3.754s3.942 1.576 3.942 3.754-1.66 3.754-3.942 3.754c-2.28 0-3.942-1.576-3.942-3.754Zm3.942 1.834c.994 0 1.707-.774 1.707-1.849 0-1.074-.714-1.848-1.707-1.848-.993 0-1.707.774-1.707 1.848 0 1.075.714 1.849 1.707 1.849ZM12.86 6.507c0-2.178 1.66-3.754 3.942-3.754 2.28 0 3.942 1.576 3.942 3.754s-1.662 3.754-3.942 3.754c-2.281 0-3.942-1.576-3.942-3.754Zm3.942 1.834c.994 0 1.707-.774 1.707-1.849 0-1.074-.715-1.848-1.707-1.848-.993 0-1.708.774-1.708 1.848 0 1.075.715 1.849 1.708 1.849ZM24.035 9.157v3.797h-2.172V2.925h1.676l.373.918c.56-.688 1.382-1.09 2.36-1.09 1.955 0 3.384 1.562 3.384 3.698 0 2.135-1.381 3.811-3.259 3.811-.946 0-1.769-.415-2.36-1.104h-.002Zm1.707-.845c.994 0 1.708-.76 1.708-1.82s-.715-1.819-1.707-1.819c-.993 0-1.708.76-1.708 1.82s.715 1.819 1.707 1.819Z"
                            fill="#555"
                        />
                    </svg>
                </div>
            </footer>
        </div>,
        {
            debug: false,
            width: imgSize.width,
            height: imgSize.height,
            fonts: [
                {
                    name: "Poppins",
                    data: await fileToBuffer(`fonts/Poppins-Medium.ttf`),
                    weight: 500,
                    style: "normal",
                },
            ],
        }
    );

    return formatBase64Str(svgToBase64(svg), `image/svg+xml`);
};

(async () => {
    // Build the checkout image
    // [ ] "Can no longer take SVG logos as input"
    const test = await buildCheckoutBase64Image(
        // "img/loop-crypto-long-black.svg",
        // "img/logo2.png",
        "img/lightnift-tall.png",
        {
            width: 1080,
            height: 566,
        }
    ).catch((error) => {
        throw new Error(`Could not build the checkout frame image\n${error}`);
    });

    try {
        await base64ToFile(test, "img/checkout.svg");
    } catch (error) {
        throw new Error(`Could not save the image\n${error}`);
    }
})();
