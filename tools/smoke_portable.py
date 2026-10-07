"""Native Windows smoke, from a freshly extracted ZIP and without Python in PATH."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile
import zipfile

def main():
    parser=argparse.ArgumentParser();parser.add_argument('archive',type=Path);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    if os.name!='nt':raise RuntimeError('native Windows required; Linux cannot certify this asset')
    checks=[]
    with tempfile.TemporaryDirectory(prefix='剧诗 clean portable ') as tmp:
        clean=Path(tmp)
        with zipfile.ZipFile(args.archive) as archive:archive.extractall(clean)
        root=next(p for p in clean.iterdir() if p.is_dir())
        launcher=root/'theater.cmd';run=clean/'my run.json';outside=clean/'unrelated cwd';outside.mkdir()
        env=dict(os.environ);env['PATH']=str(Path(os.environ['SystemRoot'])/'System32')
        for key in ('PYTHONPATH','PYTHONHOME'):env.pop(key,None)
        comspec=str(Path(os.environ['SystemRoot'])/'System32/cmd.exe')
        def call(label,*argv,expect=0,contains=None):
            command='"'+str(launcher)+'" '+subprocess.list2cmdline(list(map(str,argv)))
            reply=subprocess.run('"'+comspec+'" /d /s /c "'+command+'"',cwd=outside,env=env,capture_output=True,text=True,encoding='utf-8',timeout=90)
            if reply.returncode!=expect or (contains and contains not in reply.stdout+reply.stderr):
                raise AssertionError(f'{label}: exit {reply.returncode}, expected {expect}\n{reply.stdout}\n{reply.stderr}')
            checks.append(label);print('PASS '+label)
        call('launcher help','--help')
        call('version','--version',contains=(root/'VERSION').read_text().strip())
        call('init demo','init',run,'--demo')
        call('prepared current fight / future SAFE','check',run,contains='SAFE')
        for score in (40,42):
            call(f'authorize trial {score}','trial',run)
            call(f'record failure {score}','record',run,'--result','fail','--score',score,'--seconds',90,'--mechanics','yes','--reason','timeout','--observation','fixed window',expect=0 if score==40 else 2)
        call('third flat trial refused','trial',run,expect=2,contains='REPEATED_NON_CONVERGENCE')
        state=json.loads(run.read_text(encoding='utf-8'));fight=copy.deepcopy(state['fight']);fight['team'][-1]='fallback';fight['evidence_ids']=['new']
        ev=dict(id='new',kind='clear-reference',season_id='demo',encounter_id='act-8',objective='act-8',source='local:new-clear',reviewed=True,comparison='fallback damage compared with old flex; synthetic smoke only')
        package=clean/'replan.json';package.write_text(json.dumps(dict(fight=fight,evidence=[ev],review=dict(evidence_id='new',bottleneck='damage',comparison=ev['comparison'],hypothesis='90s score >=60',reviewed=True))),encoding='utf-8')
        call('reviewed reroute','reroute',run,package)
        call('bounded trial after reroute','trial',run)
        call('clear and update vigor','record',run,'--result','pass','--score',100,'--seconds',90,'--mechanics','yes','--reason','clear','--observation','objective completed',expect=0,contains='ENCOUNTER_COMPLETE')
        final=json.loads(run.read_text(encoding='utf-8'))
        assert len(final['attempts'])==3 and final['vigor']['core']==1 and 'act-8' in final['completed']
        checks.append('persistent attempts / actual vigor')
        call('refuse overwrite','init',run,'--demo',expect=2)
        bad=clean/'bad.json';bad.write_text('{"schema_version":1}',encoding='utf-8');call('malformed state rejected','trial',bad,expect=2,contains='BLOCKED')
        call('bundled core regression suite','self-test')
        call('current season schema','validate-season',root/'seasons/2026-10-v7.1.json')
        # Run CLI regression via the bundled runtime too; its subprocesses use sys.executable.
        reply=subprocess.run([str(root/'runtime/python.exe'),'-X','utf8','-m','unittest','discover','-s',str(root/'tests')],cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',timeout=90)
        assert reply.returncode==0,reply.stdout+reply.stderr
        checks.append('entire suite on bundled CPython')
        print(reply.stderr)
    report=dict(status='PASS',platform=platform.platform(),archive=args.archive.name,sha256=hashlib.sha256(args.archive.read_bytes()).hexdigest(),checks=checks)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'PASS {len(checks)} native Windows smoke checks')

if __name__=='__main__':main()
