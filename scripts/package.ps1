$ErrorActionPreference = 'Stop'
npm run build
python -m PyInstaller --noconfirm --name Supernote --windowed desktop/main.py
Copy-Item -Recurse -Force prompts dist/Supernote/prompts
Write-Host '已生成 dist/Supernote'
