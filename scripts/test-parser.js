const Parser = require('web-tree-sitter');
const path = require('path');
const fs = require('fs');

// Path to your WASM folder
const WASM_DIR = path.join(__dirname, '../wasm');

// Same mappings as src/index.ts to ensure consistency
const LANGUAGES = {
  ts: { lang: "typescript", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class (interface_declaration) @interface" },
  tsx: { lang: "tsx", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class (interface_declaration) @interface" },
  js: { lang: "javascript", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class" },
  jsx: { lang: "javascript", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class" },
  py: { lang: "python", query: "(function_definition) @func (class_definition) @class" },
  java: { lang: "java", query: "(class_declaration) @class (method_declaration) @method (interface_declaration) @interface" },
  rs: { lang: "rust", query: "(function_item) @func (struct_item) @struct (trait_item) @trait (impl_item) @impl" },
  go: { lang: "go", query: "(function_declaration) @func (method_declaration) @method (type_declaration) @type" },
  kt: { lang: "kotlin", query: "(class_declaration) @class (function_declaration) @func" },
  dart: { lang: "dart", query: "(class_definition) @class (function_signature) @func" },
};

async function testParser() {
    // 1. Get file from args
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Please provide a file path.");
        console.error("Usage: node scripts/test-parser.js <path-to-file>");
        process.exit(1);
    }

    const fullPath = path.resolve(targetFile);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        process.exit(1);
    }

    // 2. Detect Language
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    const config = LANGUAGES[ext];

    if (!config) {
        console.error(`No parser configuration found for extension: .${ext}`);
        process.exit(1);
    }

    console.log(`\n📄 Analyzing: ${path.basename(fullPath)}`);
    console.log(`🔧 Language: ${config.lang}`);

    // 3. Init Parser
    try {
        await Parser.init({
            locateFile(scriptName) {
                return path.join(WASM_DIR, scriptName);
            },
        });

        const parser = new Parser();
        const langFile = path.join(WASM_DIR, `tree-sitter-${config.lang}.wasm`);

        if (!fs.existsSync(langFile)) {
            console.error(`❌ Language WASM not found at: ${langFile}`);
            console.error(`   Run 'npm run setup' to download it.`);
            process.exit(1);
        }

        const Lang = await Parser.Language.load(langFile);
        parser.setLanguage(Lang);

        // 4. Parse Content
        const content = fs.readFileSync(fullPath, 'utf8');
        const tree = parser.parse(content);

        // 5. Run Query
        const query = Lang.query(config.query);
        const captures = query.captures(tree.rootNode);

        console.log(`🔍 Found ${captures.length} structural elements:\n`);
        console.log("---------------------------------------------------");
        console.log("| Line  | Type      | Signature                   ");
        console.log("---------------------------------------------------");

        // Track last index to skip duplicates (simple version)
        let lastIndex = 0;

        captures.forEach(capture => {
            const node = capture.node;
            const type = capture.name; // e.g., 'func', 'class'
            
            // Get the first line of text for the signature preview
            const signature = node.text.split('\n')[0].substring(0, 40).replace(/\s+/g, ' ');

            // 1-based line number
            const startLine = node.startPosition.row + 1;
            
            // Determine end line
            const endLine = node.endPosition.row + 1;

            console.log(`| ${startLine.toString().padEnd(5)} | ${type.padEnd(9)} | ${signature}...`);
        });
        console.log("---------------------------------------------------\n");

    } catch (e) {
        console.error("Parsing failed:", e);
    }
}

testParser();