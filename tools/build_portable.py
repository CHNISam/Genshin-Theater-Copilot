"""Build portable ZIP from first-party files and a hash-pinned official runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile
ROOT=Path(__file__).resolve().parents[1]
RUNTIME_VERSION='3.13.12'
RUNTIME_URL=f'https://www.python.org/ftp/python/{RUNTIME_VERSION}/python-{RUNTIME_VERSION}-embed-amd64.zip'
RUNTIME_SHA256='76f238f606250c87c6beac75dccd35ee99070a13490555936abb6cb64ecce3d0'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--runtime',type=Path);args=parser.parse_args()
    version=(ROOT/'VERSION').read_text().strip();dist=ROOT/'dist';dist.mkdir(exist_ok=True)
    if args.runtime:
        data=args.runtime.read_bytes()
    else:
        with urllib.request.urlopen(RUNTIME_URL,timeout=120) as reply:data=reply.read()
    if hashlib.sha256(data).hexdigest()!=RUNTIME_SHA256:raise ValueError('official runtime SHA-256 mismatch')
    runtime_zip=dist/'runtime-download.zip';runtime_zip.write_bytes(data)
    name=f'Genshin-Theater-Copilot-v{version}-win-x64';stage=ROOT/'build'/name
    if stage.exists():shutil.rmtree(stage)
    stage.mkdir(parents=True)
    with zipfile.ZipFile(runtime_zip) as archive:archive.extractall(stage/'runtime')
    (stage/'runtime/python313._pth').write_text('python313.zip\n.\n..\n',encoding='ascii')
    for folder in ('src','tests','templates','policies','fixtures','seasons','docs','plans','prompts','maintenance','guides','tools'):
        shutil.copytree(ROOT/folder,stage/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    for file in ('theater.cmd','README.md','QUICKSTART.md','VERSION','LICENSE','AGENTS.md','requirements-guide.txt'):
        shutil.copy2(ROOT/file,stage/file)
    (stage/'runtime/ORIGIN.json').write_text(json.dumps(dict(version=RUNTIME_VERSION,url=RUNTIME_URL,sha256=RUNTIME_SHA256),indent=2)+'\n')
    archive_path=dist/(name+'.zip')
    with zipfile.ZipFile(archive_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for file in sorted(stage.rglob('*')):
            if file.is_file():archive.write(file,file.relative_to(stage.parent))
    source_path=dist/f'Genshin-Theater-Copilot-v{version}-source.zip'
    with zipfile.ZipFile(source_path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for folder in ('src','tests','templates','policies','fixtures','seasons','docs','plans','prompts','maintenance','guides','tools','.github'):
            for file in sorted((ROOT/folder).rglob('*')):
                if file.is_file() and '__pycache__' not in file.parts and file.suffix!='.pyc':archive.write(file,Path('Genshin-Theater-Copilot')/file.relative_to(ROOT))
        for file in ('theater.cmd','README.md','QUICKSTART.md','VERSION','LICENSE','AGENTS.md','.gitignore','requirements-guide.txt'):
            archive.write(ROOT/file,Path('Genshin-Theater-Copilot')/file)
    runtime_zip.unlink()
    (dist/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(file.read_bytes()).hexdigest()+'  '+file.name+'\n' for file in (archive_path,source_path)),encoding='utf-8')
    print(archive_path);print(f'{archive_path.stat().st_size:,} bytes; official runtime checksum verified')

if __name__=='__main__':main()
