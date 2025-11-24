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
    
    // Create the full prompt content in a variable
    const systemPrompt = `You are a deployment bot. Write a concise, semantic git commit message (Conventional Commits) for these changes. Only output the message.`;
    const fullPromptContent = `${systemPrompt}\n\nChanges:\n${fullDiff}`;

    // WRITE TO TEMP FILE
    // This avoids "Argument list too long" errors by storing data on disk
    fs.writeFileSync(TEMP_PROMPT_FILE, fullPromptContent, 'utf-8');

    let commitMsg = `chore: release v${newVersion}`; // Fallback

    try {
        console.log("   (Streaming file to Gemini CLI...)");
        
        // Spawn Gemini process
        // We do NOT pass the prompt as an argument. We pass it via the pipe below.
        const child = spawn('gemini', ['-y', '-m', GEMINI_MODEL], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'] // [stdin, stdout, stderr]
        });

        // Create a promise to handle the async stream interaction
        const aiResponse = await new Promise((resolve, reject) => {
            let output = '';
            let errorOutput = '';

            // Collect response
            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { errorOutput += data.toString(); });

            child.on('close', (code) => {
                if (code !== 0) {
                    // Only reject if we got no output implies failure
                    if (!output && errorOutput) reject(new Error(errorOutput));
                }
                resolve(output);
            });

            child.on('error', (err) => reject(err));

            // PIPE THE FILE INTO STDIN
            // This is the magic step that fixes the "stuck" issue
            const fileStream = fs.createReadStream(TEMP_PROMPT_FILE);
            fileStream.pipe(child.stdin);
        });

        if (aiResponse) {
            const clean = aiResponse
                .replace(/`/g, '')
                .replace(/^commit message:\s*/i, '')
                .trim();
            
            if (clean.length > 0) {
                commitMsg = `${clean} (v${newVersion})`;
            }
        }

    } catch (e) {
        console.warn('⚠️  Gemini generation failed, using default message.', e.message);
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