const { app, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "assets", "app-icon.png");
const outputPath = path.join(root, "assets", "app-icon.ico");
const sizes = [16, 24, 32, 48, 64, 128, 256];

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(sourcePath);
  if (source.isEmpty()) {
    throw new Error(`Unable to read icon source: ${sourcePath}`);
  }

  const pngImages = sizes.map((size) => {
    const image = source.resize({ width: size, height: size, quality: "best" });
    return image.toPNG();
  });

  fs.writeFileSync(outputPath, createIco(pngImages, sizes));
  app.quit();
});

function createIco(images, imageSizes) {
  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + images.length * entrySize;
  const totalSize = directorySize + images.reduce((sum, image) => sum + image.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(images.length, 4);

  let imageOffset = directorySize;

  images.forEach((image, index) => {
    const size = imageSizes[index];
    const entryOffset = headerSize + index * entrySize;

    ico.writeUInt8(size === 256 ? 0 : size, entryOffset);
    ico.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    ico.writeUInt8(0, entryOffset + 2);
    ico.writeUInt8(0, entryOffset + 3);
    ico.writeUInt16LE(1, entryOffset + 4);
    ico.writeUInt16LE(32, entryOffset + 6);
    ico.writeUInt32LE(image.length, entryOffset + 8);
    ico.writeUInt32LE(imageOffset, entryOffset + 12);

    image.copy(ico, imageOffset);
    imageOffset += image.length;
  });

  return ico;
}
