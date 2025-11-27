# POC Testing Guide - Clipboard Monitor

## 🎯 Goal

Verify that the Rust clipboard monitor successfully detects system-wide clipboard changes and communicates them to the VS Code extension.

---

## 🚀 Quick Test

### 1. Launch the Extension

```powershell
# From VS Code
1. Open the workspace: C:\dev\mcp-fs-server
2. Press F5 (or select "Run Extension (No Watch)" from debug menu)
3. Wait for the Extension Development Host window to open
```

### 2. Open Output Panel

```
1. In the Extension Development Host window:
   View → Output (Ctrl+Shift+U)
2. Select "Qdrant Code Search" from the dropdown
```

### 3. Test Clipboard Detection

**Test 1: Copy from External Application**
```
1. Open Notepad (or any external app)
2. Type: "Hello from Notepad"
3. Select and copy (Ctrl+C)
4. Switch back to VS Code Extension Development Host
5. Check Output panel
```

**Expected Output:**
```
[clipboard-monitor stdout] {"type":"ready"}
[clipboard-monitor stdout] {"type":"clipboard_update","content":"Hello from Notepad","timestamp":"2025-11-27T...","length":18}
Clipboard update (preview): Hello from Notepad
```

**Expected Notification:**
```
ℹ️ Clipboard updated from system
```

---

## 🔍 Detailed Verification Steps

### Step 1: Verify Binary is Running

**Check Output Panel for:**
```
Spawning Windows clipboard-monitor: C:\dev\mcp-fs-server\extension\bin\clipboard-monitor.exe
Found binary at: C:\dev\mcp-fs-server\extension\bin\clipboard-monitor.exe
[clipboard-monitor stdout] {"type":"ready"}
Clipboard monitor ready
```

**Expected Notification:**
```
ℹ️ Clipboard monitor started
```

### Step 2: Test Multiple Clipboard Changes

**Test Sequence:**
1. Copy "Test 1" from Notepad → Check output
2. Copy "Test 2" from Browser → Check output
3. Copy code snippet from another VS Code window → Check output
4. Copy the same text again → Should NOT trigger (hash deduplication)

**Expected Behavior:**
- Each unique clipboard content triggers a new message
- Duplicate content is ignored (MD5 hash check)
- All messages appear in Output panel within 500ms

### Step 3: Verify JSON Protocol

**Each clipboard update should have this structure:**
```json
{
  "type": "clipboard_update",
  "content": "actual clipboard text",
  "timestamp": "2025-11-27T10:30:45.123Z",
  "length": 21
}
```

**Other message types:**
```json
{"type": "ready"}
{"type": "error", "message": "error description"}
```

---

## 🐛 Troubleshooting

### Issue: Binary Not Found

**Symptoms:**
```
clipboard-monitor.exe not found for Windows; ensure the extension includes the binary.
```

**Solution:**
```powershell
cd extension
npm run build:rust
# Verify: Get-Item bin\clipboard-monitor.exe
```

### Issue: Binary Fails to Start

**Symptoms:**
```
Windows clipboard-monitor failed to start: spawn ENOENT
```

**Solution:**
1. Check Rust is installed: `cargo --version`
2. Rebuild binary: `npm run build:rust`
3. Check binary permissions: Right-click → Properties → Unblock

### Issue: No Clipboard Updates

**Symptoms:**
- Binary starts successfully
- "ready" message appears
- But no "clipboard_update" messages

**Debugging:**
1. Check if binary is still running (Task Manager)
2. Look for stderr messages in Output panel
3. Try copying plain text (not images/files)
4. Check if clipboard contains text: `Get-Clipboard` in PowerShell

### Issue: Duplicate Notifications

**Symptoms:**
- Same clipboard content triggers multiple notifications

**Expected Behavior:**
- This is a bug - MD5 hash should prevent duplicates
- Check Rust code in `src/main.rs` for hash comparison logic

---

## 📊 Success Criteria

- [x] Extension starts without errors
- [x] Binary spawns successfully
- [x] "ready" message appears in Output
- [x] Copying text from external app triggers update
- [x] JSON message is well-formed
- [x] Notification appears in VS Code
- [x] Duplicate content is ignored
- [x] Multiple unique copies all trigger updates

---

## 🔬 Advanced Testing

### Test Binary Directly (Without Extension)

```powershell
cd extension\bin
.\clipboard-monitor.exe
# Copy text from another app
# Should see JSON output in console
# Press Ctrl+C to stop
```

### Test with Different Content Types

1. **Plain text** ✅ Supported
2. **Multi-line text** ✅ Supported (newlines preserved)
3. **Unicode/Emoji** ✅ Should work (UTF-8)
4. **Images** ❌ Not supported (binary will skip)
5. **Files** ❌ Not supported (binary will skip)

### Performance Testing

```
1. Copy 100 different text snippets rapidly
2. Check Output panel for all 100 updates
3. Verify no crashes or memory leaks
4. Check Task Manager for clipboard-monitor.exe memory usage
```

**Expected:**
- All updates processed
- Memory stays < 10MB
- No crashes or hangs

---

## 📝 Test Log Template

```
Date: ___________
Tester: ___________

[ ] Extension launched successfully
[ ] Binary spawned (check Output)
[ ] "ready" message received
[ ] External copy detected
[ ] JSON format correct
[ ] Notification appeared
[ ] Duplicate ignored
[ ] No errors in Output

Notes:
_________________________________
_________________________________
```

---

## 🎓 Next Steps After POC

Once basic clipboard monitoring is verified:

1. **Add XML Detection** - Check if content starts with `<` or `<?xml`
2. **Parse XML** - Extract structure and display in webview
3. **Add Filtering** - Only process XML content
4. **Add History** - Store recent clipboard items
5. **Add UI** - Display clipboard history in sidebar

---

**POC Status:** Ready for testing ✅

