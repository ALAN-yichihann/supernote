$ErrorActionPreference = 'Stop'
npm run build
python -m PyInstaller --noconfirm --name Supernote --windowed desktop/main.py
Write-Host '已生成 dist/Supernote'
