"""Portable, standard-library-only CLI. All execution uses harness gates."""
import argparse
from contextlib import contextmanager
from copy import deepcopy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from . import harness
from .fight_guard import POLICY

ROOT=Path(__file__).resolve().parents[1]


def load(path):
    path=Path(path)
    if path.stat().st_size > 4_000_000: raise ValueError('JSON file too large')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def save(path,value,create=False):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    if create and path.exists(): raise ValueError('file exists; choose a new run filename')
    data=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as stream:
        tmp=Path(stream.name);stream.write(data);stream.flush();os.fsync(stream.fileno())
    try:
        if path.exists():
            backup=path.with_suffix(path.suffix+'.bak')
            backup.write_bytes(path.read_bytes())
        os.replace(tmp,path)
    finally:
        tmp.unlink(missing_ok=True)


@contextmanager
def locked(path):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    lock=path.with_suffix(path.suffix+'.lock')
    try: handle=lock.open('x')
    except FileExistsError: raise ValueError('run is in use; if a process crashed, close it and remove '+str(lock))
    try: yield
    finally: handle.close();lock.unlink(missing_ok=True)


def initial(season):
    objective=['act-'+str(n) for n in range(1,11)]+['card-1','card-2']
    roster=season['opening_characters']
    return dict(schema_version=1,mode='live',run_id='run-'+harness._stamp(),objective=objective,completed=[],season=season,
        vigor={c:2 for c in roster},unlocked=roster[:],flowers=0,rerolls=0,buffs={},capabilities={},
        checkpoints=[dict(id=c,options=[]) for c in objective],evidence=[],fight=None,attempts=[],reroutes=[],pending=None,audit=[])


def display(report):
    if isinstance(report,dict) and 'status' in report:
        print(f"{report['status']} | Future route: {report['route']}")
        for message in report.get('reasons',[])+report.get('warnings',[]): print('  '+message)
        print('Next: '+report['next_action'])
        return 2 if report['status']=='BLOCKED' else 0
    print(json.dumps(report,ensure_ascii=False,indent=2));return 0


def self_test():
    suite=unittest.TestSuite()
    for pattern in ('test_theater_guard.py','test_fight_guard.py','test_harness.py','test_history.py','test_season.py','test_season_readiness.py','test_agent_state.py','test_production.py','test_session.py'):
        suite.addTests(unittest.defaultTestLoader.discover(str(ROOT/'tests'),pattern=pattern))
    return 0 if unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful() else 2


def parser():
    p=argparse.ArgumentParser(description='Genshin Theater Copilot | 原神剧诗 Harness — 一次有依据的试战，失败不收敛就停磨')
    sub=p.add_subparsers(dest='command',required=True)
    for cmd in ('check','status','trial'):
        sub.add_parser(cmd).add_argument('run')
    init=sub.add_parser('init');init.add_argument('run');init.add_argument('--demo',action='store_true');init.add_argument('--season',default=str(ROOT/'seasons/2026-10-v7.1.json'))
    rec=sub.add_parser('record');rec.add_argument('run');rec.add_argument('--result',choices=['pass','fail','aborted'],required=True)
    rec.add_argument('--score',type=float);rec.add_argument('--seconds',type=float,required=True);rec.add_argument('--mechanics',choices=['yes','no','unknown'],required=True)
    rec.add_argument('--reason',required=True);rec.add_argument('--observation',required=True)
    for cmd in ('sync','event','reroute','next','prepare','season'):
        x=sub.add_parser(cmd);x.add_argument('run');x.add_argument('input')
    x=sub.add_parser('recruits');x.add_argument('run');x.add_argument('candidates',nargs='+')
    x=sub.add_parser('validate-season');x.add_argument('input')
    x=sub.add_parser('research');x.add_argument('--season',required=True)
    sub.add_parser('self-test');sub.add_parser('policy');sub.add_parser('menu')
    p.add_argument('--version',action='version',version=(ROOT/'VERSION').read_text().strip())
    return p


def menu():
    print('Genshin Theater Copilot | 剧诗领航')
    print('1 演示   2 初始化本期   3 检查   4 授权一次试战   5 录入结果   6 打开使用说明   0 退出')
    choice=input('选择: ').strip()
    if choice=='0':return 0
    if choice=='6':
        if os.name=='nt':os.startfile(str(ROOT/'QUICKSTART.md'))
        else:print((ROOT/'QUICKSTART.md').read_text(encoding='utf-8'))
        return 0
    path=input('存档文件 (默认 runs/my-run.json): ').strip() or str(ROOT/'runs/my-run.json')
    args={'1':['init',path,'--demo'],'2':['init',path],'3':['check',path],'4':['trial',path]}.get(choice)
    if choice=='5':
        args=['record',path,'--result',input('结果 pass/fail/aborted: ').strip(),'--seconds',input('耗时秒: ').strip(),
            '--mechanics',input('机制 yes/no/unknown: ').strip(),'--reason',input('原因: ').strip(),'--observation',input('现场观察: ').strip()]
        score=input('固定窗口进度 0..100 (未知/提前死亡留空): ').strip()
        if score:args+=['--score',score]
    if args is None:raise ValueError('unknown menu choice')
    result=main(args);input('按回车关闭…');return result


def main(argv=None):
    for stream in (sys.stdout,sys.stderr):
        if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8',errors='backslashreplace')
    try:
        args=parser().parse_args(argv)
        cmd=args.command
        if cmd=='menu':return menu()
        if cmd=='policy':return display(POLICY)
        if cmd=='self-test':return self_test()
        if cmd=='research':
            print((ROOT/'prompts/season-research.md').read_text(encoding='utf-8').replace('{{season}}',args.season));return 0
        if cmd=='validate-season':
            season=load(args.input);harness.validate_season(season)
            print('SCHEMA_VALID | not evidence coverage or delivery approval')
            print(json.dumps(harness.assess(season),ensure_ascii=False,indent=2));return 0
        with locked(args.run):
            if cmd=='init':
                run=load(ROOT/'templates/demo-run.json') if args.demo else initial(load(args.season))
                harness.validate(run);save(args.run,run,create=True)
                print('CREATED | '+str(args.run)+' | '+('DEMO' if args.demo else 'needs current account snapshot and fight contract'));return 0
            run=load(args.run);harness.validate(run)
            if cmd in ('check','status'):return display(harness.check(run))
            if cmd=='recruits':return display(harness.recruits(run,args.candidates))
            before=deepcopy(run)
            if cmd=='trial':report=harness.authorize(run)
            elif cmd=='record':report=harness.record(run,dict(result=args.result,score=args.score,seconds=args.seconds,
                mechanics_ok={'yes':True,'no':False,'unknown':None}[args.mechanics],reason=args.reason,observation=args.observation))
            elif cmd=='sync':harness.sync(run,load(args.input));report=harness.check(run)
            elif cmd=='event':harness.purchase(run,load(args.input));report=harness.check(run)
            elif cmd=='reroute':report=harness.reroute(run,load(args.input))
            elif cmd=='prepare':report=harness.prepare(run,load(args.input))
            elif cmd=='next':
                package=load(args.input);harness.next_fight(run,package['fight'],package['evidence']);report=harness.check(run)
            elif cmd=='season':
                report=harness.refresh_season(run,load(args.input))
            else:raise ValueError('unknown command')
            if run!=before:save(args.run,run)
            return display(report)
    except (ValueError,OSError,KeyError,TypeError,AttributeError) as exc:
        print('BLOCKED | '+str(exc),file=sys.stderr);return 2


if __name__=='__main__':
    sys.exit(main())
