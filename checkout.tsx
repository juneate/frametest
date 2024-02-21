import { readFile, writeFile, stat } from "fs/promises";
import https from "https";
import Jimp from "jimp";
import satori, { Font } from "satori";

type ImageSize = { width: number; height: number };
enum SizeUnit {
    B = "B",
    kB = "kB",
}

const strToSize = (str: string, unit: SizeUnit = SizeUnit.kB): number => {
    const b = str.length * 2;
    if (unit === SizeUnit.B) return b;

    const kb = b / 1024;
    return kb;
};

const formatAsBase64Str = (base64: string, mimeType: string): string => {
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

interface BitmapOptions {
    maxWidth?: number;
    maxHeight?: number;
    imgQuality?: number;
    nonJpegMimeType?: string;
}
const processAndEncodeImage = async (
    pathOrSvg: string,
    {
        maxWidth = Jimp.AUTO,
        maxHeight = Jimp.AUTO,
        imgQuality = 100,
        nonJpegMimeType = Jimp.MIME_GIF,
    }: BitmapOptions = {}
): Promise<{ encodedImg: string; metadata: ImageSize }> => {
    try {
        // If the image is an SVG, just load as text and convert to Base64
        //    ! Note, this requires SVG to end with `.svg` extension, this can be improved
        if (
            pathOrSvg.toLowerCase().endsWith(`.svg`) ||
            pathOrSvg.toLowerCase().startsWith(`<svg`)
        ) {
            const svgString = pathOrSvg.toLowerCase().endsWith(`.svg`)
                ? (await fileToBuffer(pathOrSvg)).toString(`utf-8`)
                : pathOrSvg;

            // Get the height and width of the SVG, from the <svg> tag, or from the viewBox attribute
            return {
                encodedImg: formatAsBase64Str(
                    svgToBase64(svgString),
                    `image/svg+xml`
                ),
                metadata: getSvgDimensions(svgString),
            };
        }

        // If the image is a bitmap, load and trim transparent pixels from the outside
        const image = await trimTransparentPixels(await Jimp.read(pathOrSvg));

        // Resize image if it exceeds the maximum dimensions
        if (
            (maxWidth !== Jimp.AUTO && image.bitmap.width > maxWidth) ||
            (maxHeight !== Jimp.AUTO && image.bitmap.height > maxHeight)
        )
            image.resize(maxWidth, maxHeight);

        // Adjust quality and encode the image
        const encodedImg = await image
            .quality(imgQuality)
            .getBase64Async(
                image.getMIME() === Jimp.MIME_JPEG
                    ? Jimp.MIME_JPEG
                    : nonJpegMimeType
            );

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

interface CheckoutImageLayoutProps {
    totalWidth: number;
    totalHeight: number;
    logoImg: string;
    logoWidth: number;
    logoHeight: number;
    logoHeightMax: number;
}

const CheckoutImageLayout = ({
    totalWidth,
    totalHeight,
    logoImg,
    logoWidth,
    logoHeight,
    logoHeightMax,
}: CheckoutImageLayoutProps) => {
    return (
        <div
            style={{
                fontFamily: `Poppins, sans-serif`,
                color: `#333`,
                backgroundColor: `#fff`,
                width: `${totalWidth}px`,
                height: `${totalHeight}px`,
                padding: `4rem 4rem 2.5rem`,
                display: `flex`,
                flexDirection: `column`,
                gap: `2rem`,
                gridTemplateRows: `1fr 3rem`,
            }}
        >
            <header
                style={{
                    height: `${logoHeightMax}px`,
                    width: `100%`,
                    padding:
                        logoWidth > logoHeight
                            ? `5rem 4rem 2rem`
                            : `2rem 4rem 2.5rem`,
                }}
            >
                <img
                    src={logoImg}
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
                            fill="#555"
                            d="M34.65 10.26c-2.12 0-3.82-1.5-3.82-3.75s1.65-3.76 3.76-3.76c1.75 0 3.2 1.06 3.5 2.52l-1.36.4c-.12-1.03-1-1.8-2.14-1.8-1.37 0-2.42 1.09-2.42 2.64 0 1.54 1.05 2.6 2.42 2.6 1.18 0 2.11-.74 2.2-1.89l1.43.4c-.28 1.55-1.77 2.64-3.57 2.64Zm5.11-7.34h1.05l.16 1.2a2.19 2.19 0 0 1 2.89-1.2l-.06 1.35a2.03 2.03 0 0 0-.93-.23c-1.1 0-1.87.8-1.87 1.92v4.13h-1.24V2.92Zm6.7 0 2.27 5.5 2.11-5.5h1.43l-3.42 8.2c-.48 1.15-1.33 1.9-2.39 2l-.34-1.2c.69-.06 1.21-.37 1.5-1.03l.43-1.03L45 2.92h1.46Zm8.2 5.96v4.07h-1.24V2.93h1.05l.16 1.2a3.22 3.22 0 0 1 2.76-1.37c2.08 0 3.7 1.55 3.7 3.73s-1.7 3.78-3.7 3.78a3.25 3.25 0 0 1-2.73-1.38Zm2.54.23a2.5 2.5 0 0 0 2.58-2.6c0-1.52-1.09-2.64-2.58-2.64s-2.57 1.1-2.57 2.64 1.08 2.6 2.57 2.6Zm4.63-6.19h.5c.48 0 .84-.37.84-.88v-.95h1.18v1.83h1.7v1.12h-1.7V8.2c0 .53.42.89 1.05.89.22 0 .47-.03.65-.1l.04 1.16a3.33 3.33 0 0 1-.87.1c-1.26 0-2.11-.72-2.11-1.82V4.04h-1.28V2.92Zm5.37 3.59c0-2.18 1.63-3.76 3.88-3.76s3.88 1.58 3.88 3.76-1.63 3.75-3.88 3.75-3.88-1.58-3.88-3.75Zm3.88 2.6a2.5 2.5 0 0 0 2.58-2.6 2.53 2.53 0 0 0-2.58-2.64c-1.49 0-2.57 1.1-2.57 2.64s1.08 2.6 2.57 2.6ZM2.9.36v9.74H.72V.35H2.9ZM4.07 6.5c0-2.18 1.66-3.76 3.95-3.76s3.94 1.58 3.94 3.76-1.66 3.75-3.94 3.75c-2.28 0-3.95-1.58-3.95-3.75Zm3.95 1.83c.99 0 1.7-.77 1.7-1.85 0-1.07-.71-1.85-1.7-1.85-1 0-1.71.78-1.71 1.85 0 1.08.71 1.85 1.7 1.85Zm4.84-1.83c0-2.18 1.66-3.76 3.94-3.76 2.28 0 3.94 1.58 3.94 3.76s-1.66 3.75-3.94 3.75c-2.28 0-3.94-1.58-3.94-3.75Zm3.94 1.83c1 0 1.7-.77 1.7-1.85 0-1.07-.7-1.85-1.7-1.85s-1.7.78-1.7 1.85c0 1.08.7 1.85 1.7 1.85Zm7.23.82v3.8h-2.17V2.91h1.68l.37.92a2.96 2.96 0 0 1 2.36-1.09c1.96 0 3.39 1.57 3.39 3.7 0 2.14-1.39 3.81-3.26 3.81-.95 0-1.77-.41-2.36-1.1Zm1.71-.85c1 0 1.71-.76 1.71-1.82s-.71-1.82-1.7-1.82c-1 0-1.72.76-1.72 1.82s.72 1.82 1.71 1.82Z"
                        />
                    </svg>
                </div>
            </footer>
        </div>
    );
};

const buildSvgFromLayout = async (
    Layout: (props: CheckoutImageLayoutProps) => JSX.Element,
    imgSize: ImageSize,
    encodedImg: string,
    metadata: ImageSize,
    logoHeightMax: number,
    layoutFonts: Font[]
): Promise<string> => {
    return await satori(
        Layout({
            totalWidth: imgSize.width,
            totalHeight: imgSize.height,
            logoImg: encodedImg,
            logoWidth: metadata.height,
            logoHeight: metadata.width,
            logoHeightMax,
        }),
        {
            debug: false,
            width: imgSize.width,
            height: imgSize.height,
            fonts: layoutFonts,
        }
    ).catch(async (error) => {
        throw new Error(`Failed to build image from layout\n${error}`);
    });
};

const buildCheckoutBase64Image = async (
    logoUrlOrSvg: string,
    imgSize: ImageSize = { width: 1080, height: 566 },
    maxImgSize: number = 390,
    qualities: number[] = [100],
    currentQualityIndex: number = 0
): Promise<string> => {
    if (currentQualityIndex >= qualities.length) {
        throw new Error(
            `Failed to encode an image smaller than ${maxImgSize}kB`
        );
    }

    const logoHeightMax = 382;

    // Base64 encode the image
    const { encodedImg, metadata } = await processAndEncodeImage(logoUrlOrSvg, {
        maxHeight: logoHeightMax,
        imgQuality: qualities[currentQualityIndex],
        nonJpegMimeType:
            currentQualityIndex === 0 ? Jimp.MIME_PNG : Jimp.MIME_GIF, // Try to build in PNG first, then GIF
    }).catch((error) => {
        throw new Error(`Logo was not encoded\n${error}`);
    });

    const svgLayout = await buildSvgFromLayout(
        CheckoutImageLayout,
        imgSize,
        encodedImg,
        metadata,
        logoHeightMax,
        [
            {
                name: "Poppins",
                data: await fileToBuffer(
                    `https://s3.us-east-2.amazonaws.com/files.loopcrypto.xyz/fonts/Poppins-Medium.ttf`
                ),
                weight: 500,
                style: "normal",
            },
        ]
    );

    const result = formatAsBase64Str(svgToBase64(svgLayout), `image/svg+xml`);
    const size = strToSize(result);

    // If size isn't below the maximum, try again with a lower quality
    return size > maxImgSize
        ? await buildCheckoutBase64Image(
              logoUrlOrSvg,
              imgSize,
              maxImgSize,
              qualities,
              currentQualityIndex + 1
          )
        : result;
};

const buildTextAsSvg = async (
    imgWidth: number,
    text: string
): Promise<string> => {
    let imgHeight = 144;

    if (text.length > 16) {
        imgHeight = 64;
    } else if (text.length > 14) {
        imgHeight = 80;
    } else if (text.length > 12) {
        imgHeight = 96;
    } else if (text.length > 10) {
        imgHeight = 112;
    } else if (text.length > 8) {
        imgHeight = 128;
    }

    return await satori(
        <div
            style={{
                display: `flex`,
                fontWeight: 500,
                fontSize: `${imgHeight}px`,
                fontFamily: `Poppins, sans-serif`,
                color: `#333`,
                width: `${imgWidth}px`,
                height: `${imgHeight}px`,
                alignContent: `center`,
                justifyContent: `center`,
                whiteSpace: `nowrap`,
                textTransform: `uppercase`,
                lineHeight: `1`,
                letterSpacing: `-0.08em`,
            }}
        >
            {text}
        </div>,
        {
            debug: false,
            width: imgWidth,
            height: imgHeight,
            fonts: [
                {
                    name: "Poppins",
                    data: await fileToBuffer(
                        `https://s3.us-east-2.amazonaws.com/files.loopcrypto.xyz/fonts/Poppins-Medium.ttf`
                    ),
                    weight: 500,
                    style: "normal",
                },
            ],
        }
    ).catch(async (error) => {
        throw new Error(`Failed to build image from layout\n${error}`);
    });
};

const allLogos = [
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/9f82424a-d1af-11ec-933a-0abb4a7c4b10.jpeg",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/b31b79bb-1fe2-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://f.hubspotusercontent40.net/hubfs/5118396/Icons%20and%20Illustrations/blocknative%20black%20logo.svg",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://pbs.twimg.com/media/FHFLmXLXoAEXO6A?format=png&name=medium",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/582bba81-12b8-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/49780922-378c-11ed-933a-0abb4a7c4b10.jpg",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/e6d9faf3-2255-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/fb344b48-d0ec-11ec-a5d2-0a6c7f6a9aa4.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/328efd65-0542-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/9244034a-053f-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/22f7b0f4-0543-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/fb344b48-d0ec-11ec-a5d2-0a6c7f6a9aa4.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/7bc8b457-d1ae-11ec-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://api.typeform.com/responses/files/abe5a4dcef950c72e419d53cf778e89563480ad1dd63dfe3d76f5b3509d71490/logo.jpg",
    },
    { logo_url: "-" },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/qwestive.jpg",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/fb344b48-d0ec-11ec-a5d2-0a6c7f6a9aa4.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/9244034a-053f-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/e6d9faf3-2255-11ed-933a-0abb4a7c4b10.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/revelo.png",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/alt0.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/193a5948-66cb-11ed-a6c7-06b6a65aae5c.png",
    },
    {
        logo_url:
            "https://drive.google.com/file/d/1z-YkMWpGhbplvLALT2sKFPgay1hDYzRz/view?usp=share_link",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/nansen.png",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Lithium.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Assure+Primary+Logo+-+Gold.png",
    },
    {
        logo_url:
            "https://renoweb.io/wp-content/uploads/2022/04/RWD-logo-png-trans-min.png\t\t",
    },
    { logo_url: "-" },
    { logo_url: "-" },
    {
        logo_url:
            "https://uploads-ssl.webflow.com/61fae2f8dbd7a34c26e01ba1/6286a426c8d7ed2c0859e08c_Logo.svg",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/ENS.png",
    },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Web3Alpha_color+.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/WEB3PRO.png",
    },
    { logo_url: "" },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/LoopCrypto.png",
    },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Arena.png",
    },
    { logo_url: "" },
    { logo_url: "-" },
    { logo_url: "-" },
    { logo_url: "" },
    { logo_url: "-" },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/HashBasis+logo.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/photo_2023-05-08+17.01.20.jpeg",
    },
    { logo_url: "-" },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/MoneyBox+Traders.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Awaken.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Chainnodes.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/r3gen.jpeg",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/photo_2023-05-23+13.59.37.jpeg",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/integral_black_logo.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Castle+Capital.png",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Entendre+Finance+logo.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Chain_Patrol_-_black_logo_1-removebg-preview.png",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/The+Graph+Foundation-Logo.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/narval_logo.png",
    },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Deus+Ex+DAO+logo.png",
    },
    { logo_url: "-" },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Eukapay_TextLogo-blue.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Spindl_logo.png",
    },
    { logo_url: "-" },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/BotFrens.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Collectors+Corner.png",
    },
    { logo_url: "-" },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/magna.jpg",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Questbook.png",
    },
    { logo_url: "-" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Purp+logo.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Axiom.png",
    },
    { logo_url: "-" },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Bondex+logo_white.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/LabDAO+logo.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Staging+Labs.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Quests.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Staging+Labs.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Staging+Labs.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/ChainVine.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Altcoin-Icon.png",
    },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/ethglobal.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/franklin+logo_black.png",
    },
    { logo_url: "https://www.lootrush.com/" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/paragraph.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Goldsky+logo.png",
    },
    { logo_url: "" },
    { logo_url: "" },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Neynar+logo+2.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/Anti_Full+Logo+Black.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/a7c62d902033fccdcdd8cb440da2d010.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/23e73571af94869b7fcdd365f36a84a4.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/2d2b7b8340d8d2fdc95f748c9dbcb451.jpg",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/459c454e23b5e5212ffe50880660a37e.png",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/5b3eda661db2d3041a1a6d5fb918f6f3",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/f6a9262c889b891f3cce43c4ce1d209e",
    },
    { logo_url: "" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/66e1dd8d6f9960d9150bdcb1e2976019.jpg",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/d6a0842260f360bb991e575d458a8695",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/4c9f68fb40cdfaba69aaec5548c86aa8",
    },
    { logo_url: "-" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/ac0da8f89302b85c218f6da2e7632d79",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/583995e3a23eeb245cd196a1d6b01061",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/23919acadc4a060534c86d8c4324ea66.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/b13671fca9386b91bcb7e85bf4d95b4c.gif",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/41e939c4249bddcaed3b4c7ab488daf0.jpg",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/dca2acb54586e8e495fb0b25a3656cf6.png",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/e6f2d1119a84a66dc5dd68286920ebdd.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/7d57df1b633a590349aeaa02db26c471.png",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/3602716bbe4405db62240ba15a64467a.jpg",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/c0ae636d345331dc705d139e2030c9df",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/3adb597cbbfdbc35e4251c549d50aff3.gif",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/5398d1345bbbf08a1b05f10a2a990817",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/f2aa793262b960fbbcbf1da929932e3d.jpg",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/cdaf1b6f04ce6b9a7d57c19a1aa01bc3.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/7fa387eba7f716d0c323d72e1680693c.png",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/8ffec7d8dd99c8cf706041d3b6c08509",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/44325e9301aa37d15f27b5931c4e13aa",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/97f7272985e87d1b9826f62377727f37",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/c850c9e9a28904a700981d71ab0b8b9c.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/975c755e8a699dfe96820a8b1d074278.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/712049cbd68b93703a5b7371c2b3b568.jpg",
    },
    { logo_url: "wevm" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/f601503133ac1d6c1c3ecbe1826e0b2c.jpg",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/535b67856a07af731f0d5f2a2f7629a4.png",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/b6b48ef035940d9865d395a692fe1453.png",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/781e8deb83a7e9e559a1d6b02a291fc9.png",
    },
    {
        logo_url:
            "https://loop-entity-logos.s3.us-east-2.amazonaws.com/PFP+-+Kristof+Gazso.png",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/e56a6671957af5888400e9456e9f9474.jpg",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/43c36519cc14b3bb58e222f6f215f1cf.webp",
    },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/388d7d689170eb36346c438806803ddd.jpg",
    },
    { logo_url: "https://paragraph.xyz/email/default-avatar.png" },
    {
        logo_url:
            "https://storage.googleapis.com/papyrus_images/ed956f5227d860ea222cd25650f2fad5",
    },
];

export const checkoutLogoReplacements: ReplacementUrl[] = [
    {
        replace: "paragraph.xyz",
        with: "https://loop-entity-logos.s3.us-east-2.amazonaws.com/paragraph.png",
    },
];

const checkFileSize = async (url: string): Promise<number> => {
    if (!isAbsolutePath(url)) {
        try {
            const stats = await stat(url);
            return stats.size; // Size in bytes
        } catch (error) {
            console.error(`Failed to get file size: ${error}`);
            return -1; // Indicate an error
        }
    }

    return new Promise((resolve, reject) => {
        // Make a HEAD request to get headers
        const request = https.request(url, { method: "HEAD" }, (response) => {
            if (response.headers["content-length"]) {
                // The 'content-length' header contains the file size in bytes
                resolve(parseInt(response.headers["content-length"], 10));
            } else {
                reject(new Error("Content-Length header is missing"));
            }
        });

        request.on("error", (error) => reject(error));
        request.end();
    });
};

const saveToFile = async (path: string, data: string): Promise<void> => {
    try {
        await base64ToFile(data, path);
    } catch (error) {
        throw new Error(`Could not save the image\n${error}`);
    }
};

export type ReplacementUrl = { replace: string; with: string };
export const urlWithReplacements = (
    url: string,
    replacementTable: ReplacementUrl[]
) => {
    const replacement = replacementTable.find(({ replace }) =>
        url.toLowerCase().includes(replace.toLowerCase())
    );

    return replacement?.with ?? url;
};

(async () => {
    let over400 = 0;
    const problemImgs: any[] = [];

    // console.log(`Encoding this many images: `, allLogos.length);

    /*     [
        `Random named co`,
        `Whatever man`,
        `Testing co`,
        `Blahblah`,
        `Paragraph`,
        `Mehhh`,
        `Bing boooong`,
        `Meh`,
        `Blahhshhsd Company Ltd`,
    ].map(async (name) => {
        const companyName = await buildTextAsSvg(824, name);

        await writeFile(`img/text/${name}.svg`, companyName);
    }); */

    Promise.allSettled(
        allLogos.map(async ({ logo_url }, index) => {
            // Build the checkout image

            const test = await buildCheckoutBase64Image(
                // "https://uploads-ssl.webflow.com/61fae2f8dbd7a34c26e01ba1/6286a426c8d7ed2c0859e08c_Logo.svg",
                // "img/loop-crypto-long-black.svg",
                // "img/logo2.png",
                urlWithReplacements(logo_url, checkoutLogoReplacements),
                {
                    width: 1080,
                    height: 566,
                },
                390, // maxImgSize
                [80, 80, 60, 40]
            )
                .then(async (img) => {
                    const logoSize =
                        (await checkFileSize(logo_url).catch(() => {
                            return 0;
                        })) / 1024;

                    const encodedSize = strToSize(img);

                    let h, w;
                    if (encodedSize > 400) {
                        over400++;
                        const {
                            bitmap: { width, height },
                        } = await Jimp.read(logo_url);
                        w = width;
                        h = height;
                        problemImgs.push({
                            index,
                            logo_url,
                            logoSize,
                            encodedSize,
                        });
                    }

                    console.log(
                        `${index}, ${logoSize.toFixed(
                            2
                        )}kB ---> ${encodedSize.toFixed(2)}kB (${(
                            encodedSize / logoSize
                        ).toFixed(2)}x)`
                    );
                    if (encodedSize > 400) {
                        console.log(`   `, logo_url, `(${w} x ${h})`);
                    }

                    return img;
                })
                .catch(async (error) => {
                    const companyName = await buildTextAsSvg(
                        824,
                        `Some company`
                    );

                    await writeFile(`img/companyName.svg`, companyName);

                    const backup = await buildCheckoutBase64Image(companyName, {
                        width: 1080,
                        height: 566,
                    });

                    await saveToFile(`img/prod-logos/${index}.svg`, backup);

                    throw new Error(
                        `Could not build the checkout frame image\n${error}`
                    );
                });

            await saveToFile(`img/prod-logos/${index}.svg`, test);
        }) as any
    ).then((results) => {
        const failures = results.filter(
            (result): result is PromiseRejectedResult =>
                result.status === "rejected"
        );

        failures.forEach((result) => {
            const reason = String(result.reason).split(`Error: `).at(-1);
            if (
                reason !== `ENOENT: no such file or directory, open '-'` &&
                reason !== `ENOENT: no such file or directory, open ''`
            ) {
                console.log(`\n`);
                console.error(result.reason);
            }
        });

        console.log(problemImgs);

        const success = allLogos.length - failures.length;

        console.log(
            `\nImages over 400kb: ${over400} of ${success} (${(
                (over400 / success) *
                100
            ).toFixed(1)}%)`
        );
    });
})();
