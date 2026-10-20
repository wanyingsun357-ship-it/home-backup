from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math
base=Path('/root/ayan/bridge/public/made/pet-assets/basic-idle-connected-v4')
a=Image.open(base/'cat-tail_sway-01.png').convert('RGBA'); body=Image.open(base/'sources/cat-body-fixed-448.png').convert('RGBA')
# Local root seam only; preserve alpha and all pixels outside the patch.
m=Image.new('L',a.size);d=ImageDraw.Draw(m)
d.polygon([(284,337),(299,336),(315,342),(324,352),(324,363),(317,359),(307,354),(297,351),(291,353),(285,347)],fill=255)
m=m.filter(ImageFilter.GaussianBlur(1.5))
out=Image.composite(body,a,m)
# Continue the existing inside edge into the rump; taper the stroke as it disappears.
s=4; ink=Image.new('RGBA',(448*s,448*s));dr=ImageDraw.Draw(ink)
p0=(291,354);p1=(290,342);p2=(303,332);p3=(314,334)
pts=[]
for i in range(101):
 t=i/100;u=1-t
 x=u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0]; y=u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]
 pts.append((x,y))
for i,(x,y) in enumerate(pts):
 t=i/100; r=1.35*(1-t*.65); alpha=round(230*(1-t)**.7)
 dr.ellipse(((x-r)*s,(y-r)*s,(x+r)*s,(y+r)*s),fill=(34,37,57,alpha))
ink=ink.resize(a.size,Image.Resampling.LANCZOS);out=Image.alpha_composite(out,ink);out.putalpha(a.getchannel('A'))
# Hard local boundary protects all body contours and unrelated artwork.
result=a.copy();result.paste(out.crop((281,329,325,366)),(281,329))
result.save('/tmp/tail-v6-review/candidate.png')
bg=Image.new('RGBA',a.size,'#f5f0e9');bg.alpha_composite(result);bg.crop((265,310,340,390)).resize((600,640)).save('/tmp/tail-v6-review/root-after.png')
