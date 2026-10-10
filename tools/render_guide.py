"""Deterministic, network-free seasonal guide PNG export (optional Pillow)."""
import argparse
import base64
import hashlib
import html
import json
import os
from pathlib import Path
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from src.season_guide import load_guide


def wrap_text(text,font,width):
    """Measured CJK wrapping; preserve every character and explicit newline."""
    lines=[]
    for paragraph in text.split('\n'):
        line=''
        for char in paragraph:
            if font.getlength(char)>width:raise ValueError('Cell too narrow for glyph')
            if line and font.getlength(line+char)>width:
                lines.append(line);line=char
            else:line+=char
        lines.append(line)
    return lines


def render_guide(path,output,font_path,width=3200):
    from PIL import Image,ImageDraw,ImageFont,ImageOps
    from src.guide_editorial import player_rows
    path=Path(path);output=Path(output);root=path.parent
    data=load_guide(path)
    if width<2400 or width>4800:raise ValueError('width must be 2400..4800')
    scale=width/3200
    def px(n):return round(n*scale)
    font=ImageFont.truetype(str(font_path),px(34))
    small=ImageFont.truetype(str(font_path),px(31))
    head=ImageFont.truetype(str(font_path),px(36))
    step=px(42);pad=px(12);icon=px(88)
    side=px(200);table_width=width-side
    columns=[px(x) for x in (245,835,710,605,605)]
    columns[-1]=table_width-sum(columns[:-1])
    images={}
    for key,a in data['assets'].items():
        with Image.open(root/a['path']) as source:
            source.load()
            if source.width<32 or source.height<32:raise ValueError('Asset too small: '+key)
            images[key]=source.convert('RGBA')
    def measure(t,w,f=font):return len(wrap_text(t,f,w))*step
    cells=[];heights=[]
    for row,visible in zip(data['rows'],player_rows(data)):
        values=[visible['label'],visible['team'],visible['enemy']+'\n'+visible['tactic'],visible['before'],visible['after']]
        enemy_offset=len(row['asset_ids'])*(icon+px(6))+pad
        h=max(measure(values[i],columns[i]-2*pad-(enemy_offset if i==2 else 0),small if i==2 else font) for i in range(5))+2*pad
        heights.append(max(h,icon+2*pad));cells.append(values)
    title_h=px(64);header_h=px(64)
    buff_width=(table_width-columns[0])//len(data['buffs'])
    buff_h=max(measure(b['name']+'\n'+b['text'],buff_width-2*pad,small) for b in data['buffs'])+2*pad
    helper_width=(table_width-columns[0])//len(data['helpers'])
    helper_icon=px(140)
    helper_h=helper_icon+2*step+2*pad
    helper_note_h=measure(data['helper_note'],table_width-columns[0]-2*pad,small)+pad
    height=title_h+header_h+sum(heights)+buff_h+helper_h+helper_note_h
    im=Image.new('RGB',(width,height),'white');draw=ImageDraw.Draw(im)
    ink='#111111';gold='#ffe89d';line='#e2e2e2';red='#df1717'
    bounds=[];visible_text=[]
    def text(t,x,y,w,f=font,color=ink,line_step=None):
        visible_text.append(t)
        spacing=line_step or step
        for s in wrap_text(t,f,w):
            box=draw.textbbox((x,y),s,font=f,anchor='lt')
            if box[0]<0 or box[1]<0 or box[2]>width or box[3]>height or box[2]>x+w+1:
                raise ValueError('Text exceeds measured image/cell bounds: '+s)
            bounds.append(box);draw.text((x,y),s,font=f,fill=color,anchor='lt');y+=spacing
        return y
    def cell(x,y,w,h,fill='white'):
        draw.rectangle((x,y,x+w,y+h),fill=fill,outline=line,width=max(1,px(1)))
    def paste(key,x,y,size):
        asset=ImageOps.contain(images[key],(size,size),Image.Resampling.LANCZOS)
        im.paste(asset,(x+(size-asset.width)//2,y+(size-asset.height)//2),asset)
    draw.rectangle((0,0,width,title_h),fill='#e9e7e7')
    text(data['title'],pad,px(20),px(1550),head)
    text(data['scope'],px(1600),px(20),width-px(1600)-pad,head)
    y=title_h
    for label,w,x in zip(['幕次','阵容排布','怪物推荐','开打前','打完选'],columns,[sum(columns[:i]) for i in range(5)]):
        cell(x,y,w,header_h,'#e9e7e7');text(label,x+pad,y+px(22),w-2*pad,head)
    y+=header_h
    for row,values,h in zip(data['rows'],cells,heights):
        x=0
        for i,(t,w) in enumerate(zip(values,columns)):
            cell(x,y,w,h,gold if i==0 else 'white')
            offset=0
            if i==2:
                for j,key in enumerate(row['asset_ids']):paste(key,x+pad+j*(icon+px(6)),y+(h-icon)//2,icon)
                offset=len(row['asset_ids'])*(icon+px(6))+pad
            f=small if i==2 else font
            th=measure(t,w-2*pad-offset,f)
            text(t,x+pad+offset,y+(h-th)//2+px(4),w-2*pad-offset,f,color=red if i==1 and row.get('kind')=='boss' else ink)
            x+=w
        y+=h
    cell(0,y,columns[0],buff_h,gold);text('buff推荐',pad,y+(buff_h-step)//2,columns[0]-2*pad)
    for i,b in enumerate(data['buffs']):
        x=columns[0]+i*buff_width;w=buff_width if i<len(data['buffs'])-1 else table_width-x
        cell(x,y,w,buff_h)
        text(b['name'],x+pad,y+pad,w-2*pad,small,red)
        text(b['text'],x+pad,y+pad+measure(b['name'],w-2*pad,small),w-2*pad,small)
    y+=buff_h
    cell(0,y,columns[0],helper_h+helper_note_h,gold)
    text('大哥角色\n推荐',pad,y+px(80),columns[0]-2*pad)
    for i,h in enumerate(data['helpers']):
        x=columns[0]+i*helper_width;w=helper_width if i<len(data['helpers'])-1 else table_width-x
        paste(h['asset_id'],x+(w-helper_icon)//2,y+pad,helper_icon)
        text(h['name'],x+(w-small.getlength(h['name']))//2,y+pad+helper_icon+px(8),w-2*pad,small)
        text(h['text'],x+(w-small.getlength(h['text']))//2,y+pad+helper_icon+step+px(8),w-2*pad,small,red)
    y+=helper_h
    text(data['helper_note'],columns[0]+pad,y,table_width-columns[0]-2*pad,small)
    cell(table_width,title_h,side,height-title_h)
    # Reference-style sidebar, once. Sources/internal notes never enter this surface.
    side_chars=list(data['side_note'])
    sy=title_h+(height-title_h-len(side_chars)*step)//2
    for char in side_chars:
        text(char,table_width+(side-font.getlength(char))//2,sy,side-pad,font,red if char in '不要赌' else ink);sy+=step
    output.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=output.parent,suffix='.png');os.close(fd)
    try:
        im.save(tmp,format='PNG',optimize=True)
        os.replace(tmp,output)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    png=output.read_bytes()
    receipt={'season_id':data['season_id'],'rows':len(data['rows']),'size':[width,height],
        'clipped_cells':sum(1 for b in bounds if b[0]<0 or b[1]<0 or b[2]>width or b[3]>height),'checked_text_lines':len(bounds),'guide_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'font_sha256':hashlib.sha256(Path(font_path).read_bytes()).hexdigest(),
        'png_sha256':hashlib.sha256(png).hexdigest(),'reviewed_at':data['reviewed_at'],
        'player_text':visible_text,'editorial_profile':data['editorial_profile'],
        'claim':'Export contract passed; source review is not account-specific clear evidence.'}
    output.with_suffix('.receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    links=''.join('<li><a href="'+html.escape(s['url'],quote=True)+'">'+html.escape(k+' — '+s['locator'])+'</a></li>' for k,s in data['sources'].items())
    page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+html.escape(data['title'])+'</title><style>body{margin:0;font:16px sans-serif}img{width:100%;height:auto}details{padding:20px}</style><img alt="'+html.escape(data['title'],quote=True)+'" src="data:image/png;base64,'+base64.b64encode(png).decode()+'"><details><summary>来源与适用条件</summary><ul>'+links+'</ul><pre>'+html.escape(json.dumps({'scope':data['scope'],'review':data.get('review',{}),'rows':[{k:r[k] for k in ('id','slots','review','requires')} for r in data['rows']], 'buffs':data['buffs'],'helpers':data['helpers']},ensure_ascii=False,indent=2))+'</pre></details></html>'
    output.with_suffix('.html').write_text(page,encoding='utf-8')
    return receipt


def main(argv=None):
    parser=argparse.ArgumentParser(description='Export reviewed season data as one PNG; no network requests.')
    parser.add_argument('guide',type=Path);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--font',type=Path);parser.add_argument('--width',type=int,default=3200)
    args=parser.parse_args(argv)
    font=args.font or args.guide.parent/'assets/NotoSansSC-Regular.otf'
    try:print(json.dumps(render_guide(args.guide,args.output,font,args.width),ensure_ascii=False))
    except (ValueError,OSError,ImportError,KeyError) as e:
        parser.exit(2,'Guide export failed: '+str(e)+'\n')

if __name__=='__main__':main()
