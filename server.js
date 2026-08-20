const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
app.use(express.json());

const PROJECTS_DIR = path.join(__dirname, 'user_projects');
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR);

const runningProcesses = {};
const processLogs = {};

app.get('/api/files', (req, res) => {
  fs.readdir(PROJECTS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: '파일 목록을 불러오지 못했습니다.' });
    res.json({ files });
  });
});

app.get('/api/file', (req, res) => {
  const filePath = path.join(PROJECTS_DIR, req.query.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ content });
});

app.post('/api/file', (req, res) => {
  const { filename, content } = req.body;
  const filePath = path.join(PROJECTS_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  res.json({ success: true, message: '파일이 성공적으로 저장되었습니다.' });
});

app.get('/api/env', (req, res) => {
  const envPath = path.join(PROJECTS_DIR, '.env');
  if (!fs.existsSync(envPath)) return res.json({ env: {} });
  
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  content.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim();
  });
  res.json({ env });
});

app.post('/api/env', (req, res) => {
  const { env } = req.body;
  const envPath = path.join(PROJECTS_DIR, '.env');
  const envString = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(envPath, envString, 'utf-8');
  res.json({ success: true, message: '환경 변수가 저장되었습니다.' });
});

app.post('/api/process/start', (req, res) => {
  const { mainFile } = req.body;
  if (runningProcesses[mainFile]) {
    return res.status(400).json({ error: '이미 실행 중인 프로세스입니다.' });
  }

  const filePath = path.join(PROJECTS_DIR, mainFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '실행할 메인 파일을 찾을 수 없습니다.' });

  const envPath = path.join(PROJECTS_DIR, '.env');
  let processEnv = { ...process.env };
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    lines.forEach(line => {
      const [k, ...v] = line.split('=');
      if (k) processEnv[k.trim()] = v.join('=').trim();
    });
  }

  processLogs[mainFile] = [`[시스템] ${mainFile} 프로세스를 시작합니다...\n`];

  const child = spawn('node', [filePath], { cwd: PROJECTS_DIR, env: processEnv });
  runningProcesses[mainFile] = child;

  child.stdout.on('data', (data) => {
    const msg = `[출력] ${data}`;
    console.log(msg);
    if (processLogs[mainFile]) processLogs[mainFile].push(msg);
  });

  child.stderr.on('data', (data) => {
    const msg = `[에러] ${data}`;
    console.error(msg);
    if (processLogs[mainFile]) processLogs[mainFile].push(msg);
  });

  child.on('close', (code) => {
    delete runningProcesses[mainFile];
    const msg = `[시스템] 프로세스가 종료되었습니다. (종료 코드: ${code})\n`;
    console.log(msg);
    if (processLogs[mainFile]) processLogs[mainFile].push(msg);
  });

  res.json({ success: true, message: `${mainFile} 프로세스가 시작되었습니다.` });
});

app.post('/api/process/stop', (req, res) => {
  const { mainFile } = req.body;
  if (runningProcesses[mainFile]) {
    runningProcesses[mainFile].kill();
    delete runningProcesses[mainFile];
    if (processLogs[mainFile]) processLogs[mainFile].push(`[시스템] 사용자에 의해 프로세스가 중지되었습니다.\n`);
    return res.json({ success: true, message: '프로세스가 중지되었습니다.' });
  }
  res.status(400).json({ error: '실행 중인 프로세스가 없습니다.' });
});

app.get('/api/process/logs', (req, res) => {
  const { mainFile } = req.query;
  const logs = processLogs[mainFile] || ['[시스템] 기록된 로그가 없습니다.'];
  res.json({ logs });
});

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TypingHost 대시보드</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body class="p-4 md:p-8 max-w-7xl mx-auto">
  <header class="flex justify-between items-center mb-8 pb-4 border-b border-slate-800">
    <div>
      <h1 class="text-2xl md:text-3xl font-extrabold text-indigo-400 flex items-center gap-3">
        <i class="fa-solid fa-server"></i> TypingHost 클라우드
      </h1>
      <p class="text-slate-400 text-sm mt-1">디스코드 봇 및 웹 애플리케이션 호스팅 서비스</p>
    </div>
    <div class="flex items-center gap-2">
      <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
      <span class="text-xs text-emerald-400 font-semibold uppercase">시스템 정상 작동 중</span>
    </div>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
    <div class="space-y-6">
      <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg">
        <h2 class="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
          <i class="fa-solid fa-play text-indigo-400"></i> 서버 제어
        </h2>
        <div class="space-y-3">
          <input type="text" id="mainFile" value="index.js" class="w-full bg-slate-900 border border-slate-700 text-sm rounded-lg p-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="메인 파일명 (예: index.js)">
          <div class="grid grid-cols-2 gap-3">
            <button onclick="startBot()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm py-2.5 px-4 rounded-lg transition flex items-center justify-center gap-2">
              <i class="fa-solid fa-play"></i> 시작
            </button>
            <button onclick="stopBot()" class="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm py-2.5 px-4 rounded-lg transition flex items-center justify-center gap-2">
              <i class="fa-solid fa-stop"></i> 중지
            </button>
          </div>
        </div>
      </div>

      <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg">
        <h2 class="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
          <i class="fa-solid fa-key text-amber-400"></i> 환경 변수 (.env)
        </h2>
        <div id="envContainer" class="space-y-2 mb-4"></div>
        <button onclick="addEnvRow()" class="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-2 rounded-lg mb-2 transition">
          + 변수 추가
        </button>
        <button onclick="saveEnv()" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 rounded-lg transition">
          환경 변수 저장
        </button>
      </div>
    </div>

    <div class="lg:col-span-2 bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-slate-200 flex items-center gap-2">
          <i class="fa-solid fa-folder-open text-sky-400"></i> 파일 관리자
        </h2>
        <button onclick="saveFile()" class="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition">
          <i class="fa-solid fa-floppy-disk"></i> 저장
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
        <div class="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <div class="text-xs font-semibold text-slate-400 uppercase mb-2">파일 목록</div>
          <div id="fileList" class="space-y-1 text-sm"></div>
        </div>
        <div class="md:col-span-3 flex flex-col">
          <input type="text" id="currentFileName" class="bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono p-2 rounded-t-lg border-b-0 outline-none" readonly value="파일을 선택하세요">
          <textarea id="fileEditor" class="w-full h-80 bg-slate-950 text-slate-200 border border-slate-700 font-mono text-xs p-3 rounded-b-lg outline-none resize-none focus:border-indigo-500" placeholder="// 편집할 파일을 선택하거나 작성하세요..."></textarea>
        </div>
      </div>
    </div>
  </div>

  <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-lg font-bold text-slate-200 flex items-center gap-2">
        <i class="fa-solid fa-terminal text-emerald-400"></i> 실시간 실행 로그
      </h2>
      <button onclick="fetchLogs()" class="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-1 px-3 rounded-lg transition">
        로그 새로고침
      </button>
    </div>
    <pre id="logConsole" class="w-full h-48 bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-xs text-emerald-400 overflow-y-auto whitespace-pre-wrap">[시스템] 로그 수신 대기 중...</pre>
  </div>

  <script>
    let currentEditingFile = '';
    let logInterval = null;

    window.onload = () => {
      loadFiles();
      loadEnv();
      startLogPolling();
    };

    function startLogPolling() {
      if (logInterval) clearInterval(logInterval);
      logInterval = setInterval(fetchLogs, 2000);
    }

    async function fetchLogs() {
      const mainFile = document.getElementById('mainFile').value;
      if (!mainFile) return;
      
      try {
        const res = await fetch(\`/api/process/logs?mainFile=\${mainFile}\`);
        const data = await res.json();
        const consoleEl = document.getElementById('logConsole');
        consoleEl.textContent = data.logs.join('');
        consoleEl.scrollTop = consoleEl.scrollHeight;
      } catch (e) {}
    }

    async function loadFiles() {
      const res = await fetch('/api/files');
      const data = await res.json();
      const listEl = document.getElementById('fileList');
      listEl.innerHTML = '';
      
      data.files.forEach(f => {
        listEl.innerHTML += \`
          <div onclick="openFile('\${f}')" class="cursor-pointer p-2 rounded hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-2 truncate">
            <i class="fa-regular fa-file-code text-indigo-400"></i> \${f}
          </div>
        \`;
      });
    }

    async function openFile(filename) {
      currentEditingFile = filename;
      document.getElementById('currentFileName').value = filename;
      const res = await fetch(\`/api/file?filename=\${filename}\`);
      const data = await res.json();
      document.getElementById('fileEditor').value = data.content || '';
    }

    async function saveFile() {
      if (!currentEditingFile) return alert('선택된 파일이 없습니다.');
      const content = document.getElementById('fileEditor').value;
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: currentEditingFile, content })
      });
      const data = await res.json();
      alert(data.message);
    }

    async function loadEnv() {
      const res = await fetch('/api/env');
      const data = await res.json();
      const container = document.getElementById('envContainer');
      container.innerHTML = '';
      
      Object.entries(data.env || {}).forEach(([k, v]) => {
        addEnvRow(k, v);
      });
      if (Object.keys(data.env || {}).length === 0) {
        addEnvRow('DISCORD_TOKEN', '');
      }
    }

    function addEnvRow(key = '', value = '') {
      const container = document.getElementById('envContainer');
      const div = document.createElement('div');
      div.className = 'flex gap-2 env-row';
      div.innerHTML = \`
        <input type="text" value="\${key}" placeholder="변수명 (KEY)" class="env-key w-1/2 bg-slate-900 border border-slate-700 text-xs text-slate-200 p-2 rounded outline-none">
        <input type="text" value="\${value}" placeholder="값 (VALUE)" class="env-value w-1/2 bg-slate-900 border border-slate-700 text-xs text-slate-200 p-2 rounded outline-none">
      \`;
      container.appendChild(div);
    }

    async function saveEnv() {
      const keys = document.querySelectorAll('.env-key');
      const values = document.querySelectorAll('.env-value');
      const env = {};
      keys.forEach((kEl, idx) => {
        if (kEl.value.trim()) env[kEl.value.trim()] = values[idx].value.trim();
      });

      const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env })
      });
      const data = await res.json();
      alert(data.message);
    }

    async function startBot() {
      const mainFile = document.getElementById('mainFile').value;
      const res = await fetch('/api/process/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainFile })
      });
      const data = await res.json();
      alert(data.message || data.error);
      fetchLogs();
    }

    async function stopBot() {
      const mainFile = document.getElementById('mainFile').value;
      const res = await fetch('/api/process/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainFile })
      });
      const data = await res.json();
      alert(data.message || data.error);
      fetchLogs();
    }
  </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

