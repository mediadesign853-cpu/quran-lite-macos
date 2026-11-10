"""Finds the rectangle of every ayah on the 604 page images (as fractions 0..1 of the image) from the
grey end-of-ayah markers, and writes electron/pages/boxes.json.

Usage:  PAGE_PNG_DIR=/path/to/png-pages python tools/ayah-boxes/boxes.py
(the markers are read in reading order: marker n closes ayah n of the Quran; an ayah starts where the
previous one ends, after the banner and basmala lines of a new surah)."""
import cv2,numpy as np,json,math,os,sys
sys.path.insert(0,os.path.dirname(__file__))
from detect import load,markers
PITCH=89.6; Y_BASE=270.0
W,H=1240,1754
meta=json.load(open(os.environ.get('SURAHS_JSON','public/data/surahs.json'),encoding='utf-8'))
counts=[m['numberOfAyahs'] for m in meta]
off=[0]
for c in counts: off.append(off[-1]+c)
def surah_of(g):
    s=max(i for i in range(114) if off[i]<=g); return s+1,g-off[s]+1

class Page:
    def __init__(self,p):
        self.p=p; im=load(p); self.im=im
        self.gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
        hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV); self.sat=hsv[:,:,1]; self.val=hsv[:,:,2]
        mk=markers(p)
        self.mk=[{'x':x,'y':y,'w':w,'h':h,'yc':y+h/2,'xc':x+w/2} for x,y,w,h in mk]
        b,g,r=[im[:,:,i].astype(int) for i in range(3)]
        yellow=(r>238)&(g>238)&(b>190)&(b<235)&((r-b)>14)
        cols=np.where(yellow.mean(axis=0)>0.3)[0]; self.cl,self.cr=int(cols.min()),int(cols.max())
        self.special = p in (1,2)
        self.centers=self.line_centers()
        for m in self.mk: m['k']=min(range(len(self.centers)),key=lambda k:abs(self.centers[k]-(m['yc']+3)))
        self.mk.sort(key=lambda m:(m['k'],-m['xc']))
        # keep only small results: free the big image arrays (604 pages would not fit in memory)
        n=len(self.centers)
        self._banner=[self._banner_calc(k) for k in range(n)]
        self._extent=[self._extent_calc(k) for k in range(n)]
        self._ink=[self._ink_calc(k) for k in range(n)]
        del self.im,self.gray,self.sat,self.val
    def line_centers(self):
        if self.special:      # the two ornate pages: 7 lines inside the circle (page 2 starts with the basmala line)
            return [672,747,818,889,962,1035,1104] if self.p==1 else [670,733,808,881,953,1025,1098]
        ys=[m['yc']+3 for m in self.mk]
        if ys:
            ang=[2*math.pi*((y-Y_BASE)%PITCH)/PITCH for y in ys]
            a=math.atan2(sum(math.sin(t) for t in ang),sum(math.cos(t) for t in ang))%(2*math.pi)
            phase=a/(2*math.pi)*PITCH
        else: phase=0
        y0=Y_BASE+phase
        if y0>Y_BASE+PITCH/2: y0-=PITCH
        return [y0+k*PITCH for k in range(15)]
    def banner(self,k): return self._banner[k] if 0<=k<len(self._banner) else False
    def extent(self,k): return self._extent[k] if 0<=k<len(self._extent) else None
    def ink_between(self,k,x1,x2):
        """dark pixels columns of line k between x1 and x2 (text that is still there?)"""
        if not (0<=k<len(self._ink)): return 0
        return int(self._ink[k][max(0,int(x1)):max(0,int(x2))].sum())
    def _ink_calc(self,k):
        y=int(self.centers[k]); band=(self.gray<100)[max(0,y-30):y+30,:]
        return (band.sum(axis=0)>0)
    def _banner_calc(self,k):
        if self.special: return False
        y=int(self.centers[k]); band=(slice(max(0,y-30),y+30),slice(self.cl,self.cr+1))
        return float(self.sat[band].mean())<16 and float((self.gray[band]<100).mean())>0.13
    def _extent_calc(self,k):
        y=int(self.centers[k])
        if self.special:      # chord of the pale circle at this height
            b,g,r=[self.im[max(0,y-25):y+25,:,i].astype(int) for i in range(3)]
            yel=((r>238)&(g>238)&(b>190)&(b<235)&((r-b)>14)).mean(axis=0)>0.5
            cs=np.where(yel)[0]
            return (int(cs.min())+25,int(cs.max())-25) if len(cs)>60 else None
        band=(self.gray<100)[max(0,y-30):y+30,self.cl:self.cr+1]
        cs=np.where(band.sum(axis=0)>0)[0]
        if len(cs)<20: return None
        return int(self.cl+np.percentile(cs,0.5)),int(self.cl+np.percentile(cs,99.5))

FLUSH=28      # a marker this close to the left edge ends the line: the next ayah starts on the next line
def build():
    pages={p:Page(p) for p in range(1,605)}
    ends=[]                                   # global ayah g -> (page, marker)
    for p in range(1,605):
        for m in pages[p]['mk'] if False else pages[p].mk: ends.append((p,m))
    assert len(ends)==6236,len(ends)
    boxes={}                                  # page -> list of [g,x,y,w,h]
    diag=[]
    def add(p,g,x1,x2,k):
        pg=pages[p]; yc=pg.centers[k]+2
        x1,x2=max(0,int(x1)),min(W,int(x2))
        if x2-x1<6: return
        boxes.setdefault(p,[]).append([g,round(x1/W,4),round((yc-42)/H,4),round((x2-x1)/W,4),round(84/H,4)])
    def first_text_line(p,after,s_):
        """(page, line) where the first ayah of surah s_ begins: after an optional banner and the basmala
        (none for surah 9). The banner may be the last line of a page, with the basmala on the next page."""
        k=after+1
        while p<=604:
            pg=pages[p]
            if k>=len(pg.centers) or pg.extent(k) is None:   # nothing (more) on this page
                p,k=p+1,0
            elif pg.banner(k): k+=1
            else: break
        if s_ not in (1,9): k+=1                              # the basmala line
        if k>=len(pages[p].centers): p,k=p+1,0
        return p,k
    prev=None                                 # (page, marker) of the previous ayah
    for g,(p,m) in enumerate(ends):
        s_,n=surah_of(g)
        pg=pages[p]
        # ---- where does this ayah start?
        if n==1:
            q=prev[0] if prev else 1; after=prev[1]['k'] if prev else -1
            sp,sk=(1,0) if g==0 else (2,1) if g==7 else first_text_line(q,after,s_); sx=None
        else:
            pp,pm=prev; sp,sk=pp,pm['k']
            ext=pages[pp].extent(sk) or (pages[pp].cl+40,pages[pp].cr-40)
            pgp=pages[pp]; more=pgp.ink_between(sk,ext[0]-4,pm['x']-8)>25 or any(pgp.extent(kk) is not None for kk in range(sk+1,len(pgp.centers)))
            if pm['x']-ext[0]<=FLUSH or not more:
                sk+=1; sx=None
                if sk>len(pages[pp].centers)-1 or all(pages[pp].extent(kk) is None for kk in range(sk,len(pages[pp].centers))): sp,sk=pp+1,0
                elif pages[pp].banner(sk): diag.append((g,'banner after flush'))
            else: sx=pm['x']-2
        # ---- rectangles
        p_,k_=sp,sk; x_=sx
        guard=0
        while (p_,k_)<=(p,m['k']) and guard<60:
            guard+=1
            pgx=pages[p_]; ext=pgx.extent(k_)
            if ext is None: ext=(pgx.cl+40,pgx.cr-40)
            right=x_ if x_ is not None else ext[1]+6
            left=m['x'] if (p_,k_)==(p,m['k']) else ext[0]-6
            if (p_,k_)==(p,m['k']): left=m['x']-4
            add(p_,g,left,right,k_)
            x_=None; k_+=1
            last=len(pages[p_].centers)-1
            if k_>last or (k_>0 and pages[p_].extent(k_) is None and (p_,k_)<(p,m['k']) and p_<p):
                p_,k_=p_+1,0
        if guard>=60: diag.append((g,'guard'))
        prev=(p,m)
    return boxes,diag,pages
if __name__=='__main__':
    boxes,diag,pages=build()
    print('pages with boxes',len(boxes),'rects',sum(len(v) for v in boxes.values()),'problems',diag[:10],len(diag))
    out=os.environ.get('BOXES_OUT','electron/pages/boxes.json')
    json.dump({'v':1,'p':{str(p):v for p,v in boxes.items()}},open(out,'w'),separators=(',',':'))
    print('written',out)
