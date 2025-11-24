const fs = require('fs');
const path = require('path');
const https = require('https');

const WASM_DIR = path.join(__dirname, '../wasm');

// Ensure wasm directory exists
if (!fs.existsSync(WASM_DIR)) {
    fs.mkdirSync(WASM_DIR);
    console.log(`Created directory: ${WASM_DIR}`);
}

// 1. Copy main tree-sitter.wasm from node_modules
const copyMainWasm = () => {
    const source = path.join(__dirname, '../node_modules/web-tree-sitter/tree-sitter.wasm');
    const dest = path.join(WASM_DIR, 'tree-sitter.wasm');
    
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
        console.log('✅ Copied tree-sitter.wasm from node_modules');
    } else {
        console.error('❌ Could not find tree-sitter.wasm in node_modules. Did you run npm install?');
    }
};

// 2. Download Language Grammars
const downloadLanguage = (language, filenameOverride) => {
    // Some grammars have specific naming conventions on the CDN
    const filename = `tree-sitter-${language}.wasm`;
    const url = `https://unpkg.com/tree-sitter-wasms/out/tree-sitter-${language}.wasm`;
    const dest = path.join(WASM_DIR, filename);

    const file = fs.createWriteStream(dest);

    console.log(`⬇️  Downloading ${language}...`);

    https.get(url, (response) => {
        if (response.statusCode !== 200) {
            console.error(`❌ Failed to download ${language} (Status: ${response.statusCode})`);
            return;
        }
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log(`✅ Downloaded ${filename}`);
        });
    }).on('error', (err) => {
        fs.unlink(dest, () => {}); 
        console.error(`❌ Error downloading ${language}: ${err.message}`);
    });
};

// Run
copyMainWasm();

// Web / JS
downloadLanguage('typescript');
downloadLanguage('tsx'); // Required for React components
downloadLanguage('javascript');

// Backend / Systems
downloadLanguage('python');
downloadLanguage('java');
downloadLanguage('rust');
downloadLanguage('go'); 

// Mobile / Other
downloadLanguage('kotlin');
downloadLanguage('dart');