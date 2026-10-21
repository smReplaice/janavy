#!/usr/bin/env node
/**
 * Generates the JANAVY E2E test fixtures (deterministic, self-contained).
 * Run: node tests/e2e/fixtures/make-assets.mjs
 */
import { deflateSync } from "node:zlib";
import { crc32 } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const dir = dirname(fileURLToPath(import.meta.url));

/* ------------------------------- PDF ------------------------------------- */

/** Build a minimal, valid N-page PDF with one text line per page. */
function makePdf(pages, lineText) {
  const objects = [];
  const pageIds = [];
  const firstPageObj = 3;
  for (let i = 0; i < pages; i++) pageIds.push(firstPageObj + i * 3);

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pages} >>`;

  for (let i = 0; i < pages; i++) {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const fontId = pageId + 2;
    const text = `${lineText} — page ${i + 1} of ${pages}`;
    const content = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET\n`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objects[contentId] =
      `<< /Length ${content.length} >>\nstream\n${content}endstream`;
    objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  }

  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/* ------------------------------- PNG ------------------------------------- */

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Solid-color PNG with a simple pattern (width x height). */
function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const o = 1 + x * 3;
      row[o] = (x * 255) / width;
      row[o + 1] = (y * 255) / height;
      row[o + 2] = 128;
    }
    raw.push(row);
  }
  const idat = deflateSync(Buffer.concat(raw));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------- XLSX ------------------------------------ */

async function makeXlsx(path) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["JANAVY QA Sheet"],
    ["Metric", "Value"],
    ["Rows", 3],
    ["Checked", "yes"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  writeFileSync(path, buf);
}

/* --------------------------- DOCX / PPTX ---------------------------------- */

function makeOfficeContainer(dirPath, contentTypesXml) {
  execSync(
    `cd "${dirPath}" && printf '%s' "${contentTypesXml}" > "[Content_Types].xml" && zip -q -r payload.zip "[Content_Types].xml"`,
    { shell: "/bin/bash" },
  );
  return Buffer.from(execSync(`cat "${dirPath}/payload.zip"`));
}

mkdirSync(join(dir, "office-docx"), { recursive: true });
mkdirSync(join(dir, "office-pptx"), { recursive: true });

writeFileSync(join(dir, "qa-3page.pdf"), makePdf(3, "JANAVY QA Document"));
writeFileSync(join(dir, "qa-v2.pdf"), makePdf(2, "JANAVY QA Document v2"));
writeFileSync(join(dir, "qa-image.png"), makePng(600, 400));
writeFileSync(join(dir, "qa-notes.txt"), "JANAVY QA plain text document.\n");
await makeXlsx(join(dir, "qa-sheet.xlsx"));
writeFileSync(
  join(dir, "qa-document.docx"),
  makeOfficeContainer(
    join(dir, "office-docx"),
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  ),
);
writeFileSync(
  join(dir, "qa-slides.pptx"),
  makeOfficeContainer(
    join(dir, "office-pptx"),
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  ),
);
console.log("fixtures written to", dir);
