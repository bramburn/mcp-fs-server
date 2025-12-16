const fs = require("fs");
const path = require("path");
const https = require("https");

const WASM_DIR = path.join(__dirname, "../wasm");

// Ensure wasm directory exists
if (!fs.existsSync(WASM_DIR)) {
  fs.mkdirSync(WASM_DIR);
  console.log(`Created directory: ${WASM_DIR}`);
}

// 1. Copy main tree-sitter.wasm from node_modules
const copyMainWasm = () => {
  const source = path.join(
    __dirname,
    "../node_modules/web-tree-sitter/tree-sitter.wasm"
  );
  const dest = path.join(WASM_DIR, "tree-sitter.wasm");

  if (fs.existsSync(source)) {
    fs.copyFileSync(source, dest);
    console.log("✅ Copied tree-sitter.wasm from node_modules");
  } else {
    console.error(
      "❌ Could not find tree-sitter.wasm in node_modules. Did you run npm install?"
    );
  }
};

// 2. Download Language Grammars (with Relative Redirect Support)
const downloadFile = (inputUrl, dest, language) => {
  return new Promise((resolve, reject) => {
    const request = https.get(inputUrl, (response) => {
      // Handle Redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        if (response.headers.location) {
          // RESOLVE RELATIVE URLS HERE
          const newUrl = new URL(
            response.headers.location,
            inputUrl
          ).toString();

          downloadFile(newUrl, dest, language).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Failed to download ${language} (Status: ${response.statusCode}) from ${inputUrl}`
          )
        );
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);

      file.on("finish", () => {
        file.close();
        console.log(`✅ Downloaded ${language}`);
        resolve();
      });

      file.on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    request.on("error", (err) => {
      reject(err);
    });
  });
};

const downloadLanguage = async (language) => {
  const filename = `tree-sitter-${language}.wasm`;
  const url = `https://unpkg.com/tree-sitter-wasms/out/tree-sitter-${language}.wasm`;
  const dest = path.join(WASM_DIR, filename);

  console.log(`⬇️  Downloading ${language}...`);

  try {
    await downloadFile(url, dest, language);
  } catch (error) {
    console.error(`❌ Error downloading ${language}: ${error.message}`);
  }
};

// Run Main
(async () => {
  try {
    copyMainWasm();

    // Standard Web
    await downloadLanguage("typescript");
    await downloadLanguage("tsx");
    await downloadLanguage("javascript");

    // Backend
    await downloadLanguage("python");
    await downloadLanguage("java");
    await downloadLanguage("rust");
    await downloadLanguage("go");

    await downloadLanguage("kotlin");
    await downloadLanguage("dart");
  } catch (e) {
    console.error("Setup failed:", e);
  }
})();
