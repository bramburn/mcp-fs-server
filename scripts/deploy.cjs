const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');
const GEMINI_MODEL = 'gemini-2.5-flash';

// Helper to run shell commands
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

// Helper to sanitize input for shell arguments
function escapeShellArg(arg) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
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
    // We stage files first so we can diff what is about to be committed
    console.log('📝 Staging files...');
    run('git add .');

    // 4. Get Diff for Gemini
    console.log('🤖 Generating commit message with Gemini...');
    
    // Get the staged diff (limit length to prevent shell overflow)
    let diff = run('git diff --cached --stat'); // Get file stats first
    const fullDiff = run('git diff --cached'); // Get actual changes
    
    // Truncate full diff if excessively large for the prompt
    const diffContext = fullDiff.length > 10000 
        ? fullDiff.substring(0, 10000) + "\n...[diff truncated]" 
        : fullDiff;

    const prompt = `
        You are an automated deployment bot.
        Write a concise, semantic git commit message (Conventional Commits) for the following code changes.
        Only output the commit message, no explanations.
        
        Changes:
        ${diffContext}
    `;

    let commitMsg = `chore: release v${newVersion}`; // Fallback

    try {
        // Run Gemini CLI
        // Note: passing complex multiline strings via CLI args can be tricky on Windows/PowerShell vs Bash.
        // We write the prompt to a temp file to be safe.
        const promptFile = path.join(__dirname, '_temp_prompt.txt');
        fs.writeFileSync(promptFile, prompt);

        // We use 'type' on Windows or 'cat' on Linux/Mac to pipe to gemini if it accepts stdin, 
        // but the standard cli usually takes arguments. 
        // We will pass the instruction and read the file content into the prompt arg.
        
        // Constructing the command safely:
        const geminiCommand = `gemini -y -m ${GEMINI_MODEL} "Read the following file content and output a commit message based on the instructions inside: ${prompt.replace(/"/g, '\\"')}"`;
        
        // Alternatively, if the prompt is simple enough, we try direct injection. 
        // Let's try a safer approach: simplistic prompt + diff summary to avoid shell breaking.
        
        const cleanDiff = diffContext.replace(/["`$]/g, '');
        const safeCommand = `gemini -y -m ${GEMINI_MODEL} "Write a semantic commit message for these changes: ${cleanDiff}"`;
        
        const aiResponse = run(safeCommand);
        
        if (aiResponse) {
            // Clean up Markdown formatting if Gemini adds it
            commitMsg = aiResponse.replace(/`/g, '').replace(/^commit message:/i, '').trim();
            // Ensure version is included
            commitMsg = `${commitMsg} (v${newVersion})`;
        }
        
        // Cleanup temp file if we used one
        if (fs.existsSync(promptFile)) fs.unlinkSync(promptFile);

    } catch (e) {
        console.warn('⚠️  Gemini generation failed, using default message.', e.message);
    }

    console.log(`💬 Commit Message: "${commitMsg}"`);

    // 5. Commit, Tag, Push
    console.log('💾 Committing and Pushing...');
    
    run(`git commit -m "${commitMsg}"`);
    run(`git tag v${newVersion}`);
    run('git push');
    run('git push --tags');

    console.log(`\n✨ Successfully deployed v${newVersion} to GitHub!`);
}

deploy();