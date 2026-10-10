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
    path=Path(path);output=Path(output);root=path.parent
    data=load_guide(path)
    if width<2400 or width>4800:raise ValueError('width must be 2400..4800')
    scale=width/3200
    def px(n):return round(n*scale)
    font=ImageFont.truetype(str(font_path),px(34))
    small=ImageFont.truetype(str(font_path),px(29))
    large=ImageFont.truetype(str(font_path),px(62))
    head=ImageFont.truetype(str(font_path),px(38))
    step=px(49);pad=px(22);icon=px(108)
    columns=[px(x) for x in (180,800,900,630,630)]
    # Keep the exact requested five columns; mechanics sit within monster cell.
    columns[-1]=width-sum(columns[:-1])
    images={}
    for key,a in data['assets'].items():
        with Image.open(root/a['path']) as im:
            im.load()
            if im.width<32 or im.height<32:raise ValueError('Asset too small: '+key)
            images[key]=im.convert('RGBA')
    def measure(t,w,f=font):return len(wrap_text(t,f,w))*step
    cells=[];heights=[]
    for row in data['rows']:
        values=[row['label'],row['team'],row['enemy']+'\n'+row['tactic'],row['before'],row['after']]
        h=max(measure(values[i],columns[i]-2*pad-(icon+pad if i==2 else 0)) for i in range(5))+2*pad
        h=max(h,len(row['asset_ids'])*(icon+px(8))+2*pad)
        heights.append(h);cells.append(values)
    title_step=px(76)
    title_h=len(wrap_text(data['title'],large,width-2*pad))*title_step
    scope_y=pad+title_h
    subtitle_y=scope_y+measure(data['scope'],width-2*pad,head)
    subtitle=data.get('subtitle','通用参考路线；按实际招募与耐力修订')
    top=subtitle_y+measure(subtitle,width-2*pad,small)+pad
    header_h=px(76)
    buff_w=width//len(data['buffs'])
    buff_heading=max(measure(b['name'],buff_w-2*pad,head) for b in data['buffs'])
    buff_h=buff_heading+max(measure(b['text'],buff_w-2*pad,small) for b in data['buffs'])+3*pad
    helper_w=width//len(data['helpers'])
    helper_top=max(px(140),max(px(34)+measure(h['name'],helper_w-px(160)-pad,small)+pad for h in data['helpers']))
    helper_h=helper_top+max(measure(h['text'],helper_w-2*pad,small) for h in data['helpers'])+pad
    note_text='\n'.join(data['notes'])
    notes_h=measure(note_text,width-2*pad,small)+2*pad
    footer=data.get('footer','')+'  |  GI Theater · '+data['reviewed_at']
    footer_h=measure(footer,width-2*pad,small)+2*pad
    height=top+header_h+sum(heights)+buff_h+helper_h+notes_h+footer_h
    im=Image.new('RGB',(width,height),'white');draw=ImageDraw.Draw(im)
    ink='#17232d';muted='#52606b';gold='#fff0bf';line='#dce1e5';red='#b33329'
    bounds=[]
    def text(t,x,y,w,f=font,color=ink,line_step=None):
        spacing=line_step or step
        for s in wrap_text(t,f,w):
            box=draw.textbbox((x,y),s,font=f,anchor='lt')
            if box[0]<0 or box[1]<0 or box[2]>width or box[3]>height or box[2]>x+w+1:
                raise ValueError('Text exceeds measured image/cell bounds: '+s)
            bounds.append(box)
            draw.text((x,y),s,font=f,fill=color,anchor='lt');y+=spacing
        return y
    draw.rectangle((0,0,width,top),fill='#f5f6f7')
    text(data['title'],pad,pad,width-2*pad,large,line_step=title_step)
    text(data['scope'],pad,scope_y,width-2*pad,head)
    text(subtitle,pad,subtitle_y,width-2*pad,small,muted)
    y=top
    for label,w in zip(['幕次','阵容排布','怪物推荐','开打前','打完选'],columns):
        x=sum(columns[:['幕次','阵容排布','怪物推荐','开打前','打完选'].index(label)])
        draw.rectangle((x,y,x+w,y+header_h),fill='#e9ecef',outline=line)
        text(label,x+pad,y+px(18),w-2*pad,head)
    y+=header_h
    for row,values,h in zip(data['rows'],cells,heights):
        x=0
        for i,(t,w) in enumerate(zip(values,columns)):
            fill=gold if i==0 else '#fffaf1' if row.get('kind')=='card' else 'white'
            draw.rectangle((x,y,x+w,y+h),fill=fill,outline=line,width=max(1,px(2)))
            offset=0
            if i==2:
                for j,key in enumerate(row['asset_ids']):
                    asset=ImageOps.contain(images[key],(icon,icon),Image.Resampling.LANCZOS)
                    im.paste(asset,(x+pad+(icon-asset.width)//2,y+pad+j*(icon+px(8))+(icon-asset.height)//2),asset)
                offset=icon+pad
            text(t,x+pad+offset,y+pad,w-2*pad-offset,color=red if i==1 and row.get('kind')=='boss' else ink)
            x+=w
        y+=h
    for i,b in enumerate(data['buffs']):
        x=i*width//len(data['buffs']);w=(i+1)*width//len(data['buffs'])-x
        draw.rectangle((x,y,x+w,y+buff_h),fill='#f4f8fb',outline=line)
        text(b['name'],x+pad,y+pad,w-2*pad,head,red)
        text(b['text'],x+pad,y+2*pad+buff_heading,w-2*pad,small)
    y+=buff_h
    helper_w=width//len(data['helpers'])
    for i,h in enumerate(data['helpers']):
        x=i*helper_w;w=helper_w if i<len(data['helpers'])-1 else width-x
        draw.rectangle((x,y,x+w,y+helper_h),fill='white',outline=line)
        asset=ImageOps.contain(images[h['asset_id']],(px(118),px(118)),Image.Resampling.LANCZOS)
        im.paste(asset,(x+pad,y+px(12)),asset)
        text(h['name'],x+px(152),y+px(34),w-px(160)-pad,small)
        text(h['text'],x+pad,y+helper_top,w-2*pad,small)
    y+=helper_h
    draw.rectangle((0,y,width,y+notes_h),fill='#fff0bf')
    text(note_text,pad,y+pad,width-2*pad,small)
    y+=notes_h
    footer=data.get('footer','')+'  |  GI Theater · '+data['reviewed_at']
    text(footer,pad,y+px(20),width-2*pad,small,muted)
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
        'claim':'Export contract passed; source review is not account-specific clear evidence.'}
    output.with_suffix('.receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    links=''.join('<li><a href="'+html.escape(s['url'],quote=True)+'">'+html.escape(k+' — '+s['locator'])+'</a></li>' for k,s in data['sources'].items())
    page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+html.escape(data['title'])+'</title><style>body{margin:0;font:16px sans-serif}img{width:100%;height:auto}details{padding:20px}</style><img alt="'+html.escape(data['title'],quote=True)+'" src="data:image/png;base64,'+base64.b64encode(png).decode()+'"><details><summary>来源与适用条件</summary><ul>'+links+'</ul></details></html>'
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
