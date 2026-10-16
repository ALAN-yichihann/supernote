"""pywebview 桌面入口及 JavaScript 文件 API。"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import webview

from .storage import Storage


class API:
    def __init__(self, dev: bool = False) -> None: self.storage=Storage(); self.dev=dev; self.window:Any=None; self.dirty_value=False
    def open_file(self) -> dict[str,Any]:
        result=self.window.create_file_dialog(webview.OPEN_DIALOG,file_types=('Supernote JSON (*.json)','所有文件 (*.*)'))
        if not result:return {'ok':True,'value':None}
        try:return {'ok':True,'value':self.storage.read(result[0])}
        except Exception as exc:return {'ok':False,'error':f'打开失败：{exc}'}
    def save_file(self,data:dict[str,Any],save_as:bool=False)->dict[str,Any]:
        try:
            if save_as or self.storage.path is None:
                result=self.window.create_file_dialog(webview.SAVE_DIALOG,save_filename=f"{data.get('title','笔记')}.json",file_types=('Supernote JSON (*.json)',))
                if not result:return {'ok':True,'value':False}
                self.storage.path=Path(result)
            self.storage.write(data); self.dirty_value=False; return {'ok':True,'value':True}
        except Exception as exc:return {'ok':False,'error':f'保存失败：{exc}'}
    def reset_file(self)->dict[str,Any]: self.storage.path=None; self.dirty_value=False; return {'ok':True,'value':None}
    def dirty(self,value:bool)->None:self.dirty_value=value
    def close_window(self)->None:self.window.destroy()
    def get_settings(self)->dict[str,Any]:
        return {'ok':True,'value':{ident:{'endpoint':self.storage.get_secret(f'{ident}_endpoint') or '', 'model':self.storage.get_secret(f'{ident}_model') or '', 'hasKey':bool(self.storage.get_secret(f'{ident}_key'))} for ident in ('qa','graph')}}
    def save_settings(self,value:dict[str,Any])->dict[str,Any]:
        for ident in ('qa','graph'):
            entry=value.get(ident,{})
            self.storage.set_secret(f'{ident}_endpoint',str(entry.get('endpoint','')))
            self.storage.set_secret(f'{ident}_model',str(entry.get('model','')))
            if entry.get('key'): self.storage.set_secret(f'{ident}_key',str(entry['key']))
        return {'ok':True,'value':None}
def main()->None:
    parser=argparse.ArgumentParser(); parser.add_argument('--dev',action='store_true'); args=parser.parse_args(); api=API(args.dev); url='http://127.0.0.1:5173' if args.dev else str(Path(__file__).resolve().parents[1]/'dist'/'index.html'); window=webview.create_window('Supernote',url,js_api=api,width=1440,height=900,min_size=(1000,650)); api.window=window; webview.start(debug=args.dev)
if __name__=='__main__':main()
