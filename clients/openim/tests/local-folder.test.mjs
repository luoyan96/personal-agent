import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url),
  client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = path.resolve(
    client,
    "../../../.runtime/windows-local-folder-20261006/backend",
  ),
  run = path.join(evidence, "run-" + randomUUID().slice(0, 8));
await fs.mkdir(path.join(run, "compiled"), { recursive: true });
for (const name of ["localFolder", "localFolderParser"]) {
  const source = await fs.readFile(
    path.join(client, `electron/utils/${name}.ts`),
    "utf8",
  );
  const output = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    })
    .outputText.replace(
      /require\((['"])(pdfjs-dist\/(?:legacy\/)?build\/pdf(?:\.worker)?.js|adm-zip)\1\)/g,
      (_all, _quote, dependency) =>
        `require(${JSON.stringify(require.resolve(dependency))})`,
    )
    .replace(/require\.resolve\((['"])pdfjs-dist\/package.json\1\)/g, () =>
      JSON.stringify(require.resolve("pdfjs-dist/package.json")),
    );
  await fs.writeFile(path.join(run, "compiled", name + ".js"), output);
}
const { LocalFolderStore } = require(path.join(run, "compiled/localFolder.js")),
  { parseLocalDocument } = require(path.join(run, "compiled/localFolderParser.js"));
const fixtureRoot = path.join(run, "fixtures");
await fs.mkdir(fixtureRoot);
const results = [];
const check = (name, fn) =>
  test(name, async () => {
    await fn();
    results.push({ name, passed: true });
    await fs.writeFile(
      path.join(run, "report.json"),
      JSON.stringify(
        {
          platform: process.platform,
          node: process.version,
          realFilesystem: true,
          realPdfJs: "3.2.146",
          realElectron: false,
          model: false,
          results,
        },
        null,
        2,
      ),
    );
  });
const folder = async () => {
  const root = path.join(fixtureRoot, randomUUID());
  await fs.mkdir(root);
  return root;
};
function pdf(texts) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${texts
      .map((_, index) => `${4 + index * 2} 0 R`)
      .join(" ")}] /Count ${texts.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  texts.forEach((text, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${
        5 + index * 2
      } 0 R >>`,
    );
    const stream = `BT /F1 12 Tf 40 740 Td (${text}) Tj ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  return Buffer.from(
    out +
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
        .join("")}trailer\n<< /Size ${
        objects.length + 1
      } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}
await fs.writeFile(
  path.join(fixtureRoot, "synthetic-two-pages.pdf"),
  pdf(["SYNTHETIC PAGE ONE baseline.", "SYNTHETIC PAGE TWO conclusion."]),
);
const AdmZip = require("adm-zip"),
  zip = new AdmZip();
zip.addFile("[Content_Types].xml", Buffer.from("<Types/>"));
zip.addFile(
  "word/document.xml",
  Buffer.from(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>真实合成DOCX &amp; bounded text</w:t></w:r></w:p></w:body></w:document>',
  ),
);
await fs.writeFile(path.join(fixtureRoot, "synthetic.docx"), zip.toBuffer());
await fs.writeFile(
  path.join(evidence, "fixtures.json"),
  JSON.stringify(
    {
      pdf: path.join(fixtureRoot, "synthetic-two-pages.pdf"),
      docx: path.join(fixtureRoot, "synthetic.docx"),
      run,
    },
    null,
    2,
  ),
);

check(
  "scans only relative supported files, excludes secrets/dependencies/junctions and reads real UTF8 repeatedly",
  async () => {
    const root = await folder();
    await fs.mkdir(path.join(root, "nested"));
    await fs.mkdir(path.join(root, ".git"));
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, ".env"), "secret");
    await fs.writeFile(path.join(root, "credentials.json"), "secret");
    await fs.writeFile(
      path.join(root, "nested", "code.ts"),
      'const answer = "真实正文";\n',
    );
    await fs.writeFile(path.join(root, "node_modules", "hidden.txt"), "dependency");
    await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0, 1]));
    const outside = await folder();
    await fs.writeFile(path.join(outside, "outside.txt"), "MUST_NOT_READ");
    await fs.symlink(outside, path.join(root, "escaped"), "junction");
    const store = new LocalFolderStore(parseLocalDocument),
      manifest = await store.scan(root, "owner");
    assert.deepEqual(
      manifest.files.map((file) => file.relativePath),
      ["nested/code.ts"],
    );
    assert.ok(manifest.scan.excludedEntries >= 5);
    assert.equal(manifest.limits.maxMergedBytes, 52000);
    assert.ok(!JSON.stringify(manifest).includes(root));
    const request = { grantId: manifest.grantId, fileIds: [manifest.files[0].id] },
      first = await store.read(request, "owner");
    assert.equal(first.files[0].text, 'const answer = "真实正文";\n');
    assert.equal(first.utf8Bytes, Buffer.byteLength(first.markdown));
    assert.deepEqual(await store.read(request, "owner"), first);
    await assert.rejects(store.read(request, "other"), /LOCAL_FOLDER_FORBIDDEN/);
    await assert.rejects(
      store.read({ ...request, path: outside }, "owner"),
      /LOCAL_FOLDER_INVALID_SELECTION/,
    );
    await assert.rejects(
      store.read({ ...request, fileIds: ["../outside.txt"] }, "owner"),
      /LOCAL_FOLDER_INVALID_SELECTION/,
    );
    store.release(manifest.grantId, "owner");
    await assert.rejects(store.read(request, "owner"), /LOCAL_FOLDER_REVOKED/);
  },
);
check(
  "rejects post-scan rename/replacement and a directory junction changed to an outside root before opening",
  async () => {
    const root = await folder(),
      outside = await folder();
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "nested", "same.txt"), "APPROVED");
    await fs.writeFile(path.join(outside, "same.txt"), "UNAPPROVED");
    const store = new LocalFolderStore(async () => {
        throw Error("must not parse changed path");
      }),
      manifest = await store.scan(root, "owner");
    await fs.rename(path.join(root, "nested"), path.join(root, "old-nested"));
    await fs.symlink(outside, path.join(root, "nested"), "junction");
    await assert.rejects(
      store.read(
        { grantId: manifest.grantId, fileIds: [manifest.files[0].id] },
        "owner",
      ),
      /LOCAL_FOLDER_CHANGED/,
    );
    const normal = await folder();
    await fs.writeFile(path.join(normal, "same.txt"), "original");
    const original = await store.scan(normal, "owner");
    await fs.rename(path.join(normal, "same.txt"), path.join(normal, "renamed.txt"));
    await fs.writeFile(path.join(normal, "same.txt"), "replaced");
    await assert.rejects(
      store.read(
        { grantId: original.grantId, fileIds: [original.files[0].id] },
        "owner",
      ),
      /LOCAL_FOLDER_CHANGED/,
    );
  },
);
check(
  "rejects binary UTF8, oversized files/combined escaped text, duplicate or excess selection without truncation",
  async () => {
    const root = await folder();
    await fs.writeFile(path.join(root, "binary.txt"), Buffer.from([255, 0]));
    await fs.writeFile(path.join(root, "escaped.txt"), '"'.repeat(27000));
    await fs.writeFile(path.join(root, "huge.txt"), "x".repeat(2097153));
    await fs.writeFile(path.join(root, "valid.txt"), "完整正文");
    const store = new LocalFolderStore(parseLocalDocument),
      manifest = await store.scan(root, "owner"),
      file = (name) => manifest.files.find((file) => file.relativePath === name).id;
    assert.ok(!manifest.files.some((file) => file.relativePath === "huge.txt"));
    await assert.rejects(
      store.read({ grantId: manifest.grantId, fileIds: [file("binary.txt")] }, "owner"),
      /LOCAL_FOLDER_BINARY/,
    );
    await assert.rejects(
      store.read(
        { grantId: manifest.grantId, fileIds: [file("escaped.txt")] },
        "owner",
      ),
      /LOCAL_FOLDER_TOO_LARGE/,
    );
    await assert.rejects(
      store.read(
        { grantId: manifest.grantId, fileIds: Array(11).fill(file("valid.txt")) },
        "owner",
      ),
      /LOCAL_FOLDER_INVALID_SELECTION/,
    );
    await assert.rejects(
      store.read(
        { grantId: manifest.grantId, fileIds: [file("valid.txt"), file("valid.txt")] },
        "owner",
      ),
      /LOCAL_FOLDER_INVALID_SELECTION/,
    );
    assert.equal(
      (
        await store.read(
          { grantId: manifest.grantId, fileIds: [file("valid.txt")] },
          "owner",
        )
      ).files[0].text,
      "完整正文",
    );
  },
);
check(
  "extracts actual two-page PDF and DOCX text, rejects scanned/corrupt PDF, and propagates revocation during extraction",
  async () => {
    const root = await folder();
    await fs.copyFile(
      path.join(fixtureRoot, "synthetic-two-pages.pdf"),
      path.join(root, "paper.pdf"),
    );
    await fs.copyFile(
      path.join(fixtureRoot, "synthetic.docx"),
      path.join(root, "paper.docx"),
    );
    const store = new LocalFolderStore(parseLocalDocument),
      manifest = await store.scan(root, "owner"),
      selection = await store.read(
        { grantId: manifest.grantId, fileIds: manifest.files.map((file) => file.id) },
        "owner",
      );
    assert.match(selection.markdown, /PAGE ONE/);
    assert.match(selection.markdown, /PAGE TWO/);
    assert.match(selection.markdown, /真实合成DOCX & bounded text/);
    assert.equal(selection.files.find((file) => file.kind === "pdf").pageCount, 2);
    assert.equal(selection.utf8Bytes, Buffer.byteLength(selection.markdown));
    await assert.rejects(parseLocalDocument(pdf([""]), "pdf"), /LOCAL_FOLDER_NO_TEXT/);
    await assert.rejects(
      parseLocalDocument(Buffer.from("%PDF-1.4\nbroken"), "pdf"),
      /LOCAL_FOLDER_PARSE_FAILED/,
    );
    let release, entered;
    const ready = new Promise((resolve) => (entered = resolve)),
      hold = new Promise((resolve) => (release = resolve)),
      slow = new LocalFolderStore(async () => {
        entered();
        await hold;
        return { text: "must not return after revoke" };
      }),
      grant = await slow.scan(root, "owner"),
      pending = slow.read(
        {
          grantId: grant.grantId,
          fileIds: [grant.files.find((file) => file.kind === "pdf").id],
        },
        "owner",
      );
    await ready;
    slow.releaseAll("owner");
    release();
    await assert.rejects(pending, /LOCAL_FOLDER_REVOKED/);
  },
);
