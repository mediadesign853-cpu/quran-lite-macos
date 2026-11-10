from PIL import Image,ImageDraw,ImageFilter
import math
S=1024; SS=2           # draw at 2048, downsample
W=S*SS
def sc(v): return int(v*SS)
im=Image.new('RGBA',(W,W),(0,0,0,0))
# background: rounded square with vertical gradient
g=Image.new('RGBA',(W,W))
gd=ImageDraw.Draw(g)
top=(12,84,68);bot=(31,128,104)
for y in range(W):
    t=y/(W-1);gd.line([(0,y),(W,y)],fill=(int(top[0]+(bot[0]-top[0])*t),int(top[1]+(bot[1]-top[1])*t),int(top[2]+(bot[2]-top[2])*t),255))
mask=Image.new('L',(W,W),0);ImageDraw.Draw(mask).rounded_rectangle([0,0,W-1,W-1],sc(210),fill=255)
im.paste(g,(0,0),mask)
d=ImageDraw.Draw(im)
CREAM=(247,242,228,255);CREAM2=(224,214,186,255);GOLD=(214,170,70,255);GREEN=(22,110,90,255)
# book (open Quran): lower page stack, then pages
def poly(pts,fill,outline=None,w=0): d.polygon([(sc(x),sc(y)) for x,y in pts],fill=fill,outline=outline,width=w)
poly([(512,725),(330,685),(150,725),(150,700),(330,660),(512,700)],CREAM2)
poly([(512,725),(694,685),(874,725),(874,700),(694,660),(512,700)],CREAM2)
L=[(512,335),(330,288),(150,335),(150,690),(330,645),(512,690)]
R=[(512,335),(694,288),(874,335),(874,690),(694,645),(512,690)]
poly(L,CREAM);poly(R,CREAM)
d.line([(sc(512),sc(335)),(sc(512),sc(690))],fill=(170,150,105,255),width=sc(8))
# gold inner frame on pages
def inset(p,k):
    cx=sum(x for x,_ in p)/len(p);cy=sum(y for _,y in p)/len(p)
    return [(cx+(x-cx)*k,cy+(y-cy)*k) for x,y in p]
for P in (L,R): d.line([(sc(x),sc(y)) for x,y in inset(P,0.88)]+[(sc(inset(P,0.88)[0][0]),sc(inset(P,0.88)[0][1]))],fill=GOLD,width=sc(5))
# 8-pointed star on the left page
cx,cy=335,490;pts=[]
for i in range(16):
    r=100 if i%2==0 else 52;a=math.pi*i/8-math.pi/2
    pts.append((cx+r*math.cos(a),cy+r*math.sin(a)))
poly(pts,GREEN,GOLD,sc(5))
poly([(cx+22*math.cos(math.pi*i/4),cy+22*math.sin(math.pi*i/4)) for i in range(8)],CREAM)
# text lines on the right page
for k,(w,y) in enumerate([(190,395),(190,445),(150,495),(190,545),(120,595)]):
    x1=745;x0=x1-w
    d.rounded_rectangle([sc(x0),sc(y-9),sc(x1),sc(y+9)],sc(9),fill=GREEN)
# offline badge: Wi-Fi crossed out
bx,by,br=770,775,200
d.ellipse([sc(bx-br-14),sc(by-br-14),sc(bx+br+14),sc(by+br+14)],fill=(10,70,56,255))
d.ellipse([sc(bx-br),sc(by-br),sc(bx+br),sc(by+br)],fill=(255,255,255,255))
wc=(bx,by+85)
for r in (150,100,50):
    d.pieslice([sc(wc[0]-r),sc(wc[1]-r),sc(wc[0]+r),sc(wc[1]+r)],228,312,fill=GREEN)
    d.pieslice([sc(wc[0]-r+27),sc(wc[1]-r+27),sc(wc[0]+r-27),sc(wc[1]+r-27)],226,314,fill=(255,255,255,255))
d.ellipse([sc(wc[0]-24),sc(wc[1]-24),sc(wc[0]+24),sc(wc[1]+24)],fill=GREEN)
a=(bx-125,by-140);b=(bx+125,by+130)
d.line([(sc(a[0]),sc(a[1])),(sc(b[0]),sc(b[1]))],fill=(255,255,255,255),width=sc(62))
d.line([(sc(a[0]),sc(a[1])),(sc(b[0]),sc(b[1]))],fill=(214,64,64,255),width=sc(36))
big=im.resize((S,S),Image.LANCZOS)
big.save('icon-1024.png')
for z in (512,192,256,128,64,48,32,16):
    big.resize((z,z),Image.LANCZOS).save(f'icon-{z}.png')
big.save('app.ico',sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])
print('ok')
