const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Configuration
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');
const GEMINI_MODEL = 'gemini-2.5-flash';
const TEMP_PROMPT_FILE = path.join(__dirname, '_gemini_prompt.txt');

// Helper to run shell commands (synchronous)
function run(command, options = {}) {
    try {
        console.log(`\n> ${command}`);
        return execSync(command, { stdio: 'pipe', encoding: 'utf-8', ...options }).trim();
    } catch (error) {
        console.error(`❌ Command failed: ${command}`);
        if (error.stdout) console.error(error.stdout);
        if (error.stderr) console.error(error.stderr);
        process.exit(1);
    }
}

async function deploy() {
    console.log('🚀 Starting Deployment Process...');

    // 1. Update Version (Patch Bump)
    console.log('📦 Updating version...');
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    const versionParts = pkg.version.split('.').map(Number);
    versionParts[2] += 1; // Increment patch
    const newVersion = versionParts.join('.');
    pkg.version = newVersion;
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2));
    console.log(`✅ Version bumped to ${newVersion}`);

    // 2. Build
    console.log('🛠️  Running build...');
    run('npm run build');

    // 3. Stage Files
    console.log('📝 Staging files...');
    run('git add .');

    // 4. Get Diff & Generate Commit Message
    console.log('🤖 Generating commit message with Gemini...');
    
    // Get diff
    run('git diff --cached --stat'); 
    const fullDiff = run('git diff --cached');
    
    // --- Structured Output Prompt Engineering ---
    const structureInstruction = `
        You are an automated deployment bot writing a semantic git commit message (Conventional Commits).
        Analyze the changes below and output a single JSON object.
        The JSON object MUST contain two fields:
        1. "type": The commit type (e.g., feat, fix, chore, refactor).
        2. "message": The concise, one-line commit description.
        DO NOT include any explanation, markdown, or text outside the JSON block.
    `;
    const fullPromptContent = `${structureInstruction}\n\nChanges:\n${fullDiff}`;

    // WRITE TO TEMP FILE
    fs.writeFileSync(TEMP_PROMPT_FILE, fullPromptContent, 'utf-8');

    let commitMsg = `chore: release v${newVersion}`; // Fallback

    try {
        console.log("   (Streaming file to Gemini CLI...)");
        
        // Spawn Gemini process
        const child = spawn('gemini', ['-y', '-m', GEMINI_MODEL], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Create a promise to handle the async stream interaction
        const aiResponse = await new Promise((resolve, reject) => {
            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { errorOutput += data.toString(); });

            child.on('close', (code) => {
                if (code !== 0) {
                    if (!output && errorOutput) reject(new Error(errorOutput));
                }
                resolve(output);
            });

            child.on('error', (err) => reject(err));

            // PIPE THE FILE INTO STDIN
            const fileStream = fs.createReadStream(TEMP_PROMPT_FILE);
            fileStream.pipe(child.stdin);
        });

        if (aiResponse) {
            // 1. Clean the response: remove markdown backticks (```json...)
            let jsonString = aiResponse.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

            // 2. Parse the JSON
            const parsed = JSON.parse(jsonString);

            if (parsed.type && parsed.message) {
                commitMsg = `${parsed.type}: ${parsed.message} (v${newVersion})`;
            }
        }

    } catch (e) {
        console.warn(`⚠️  Gemini generation failed or JSON parsing error. Using default message. Error: ${e.message}`);
    } finally {
        // CLEANUP: Remove the temp file
        if (fs.existsSync(TEMP_PROMPT_FILE)) {
            fs.unlinkSync(TEMP_PROMPT_FILE);
        }
    }

    console.log(`💬 Commit Message: "${commitMsg}"`);

    // 5. Commit, Tag, Push
    console.log('💾 Committing and Pushing...');
    
    try {
        // Check if there are changes to commit
        execSync('git diff --cached --quiet'); 
        console.log("⚠️  No changes to commit.");
    } catch (e) {
        // If git diff returns 1 (error), it actually means there ARE changes
        run(`git commit -m "${commitMsg}"`);
        run(`git tag v${newVersion}`);
        run('git push');
        run('git push --tags');
        console.log(`\n✨ Successfully deployed v${newVersion} to GitHub!`);
    }
}

deploy();