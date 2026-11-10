"""Finds the grey end-of-ayah markers on a page image (the circles with the ayah number)."""
import cv2,numpy as np,os
SRC=os.environ.get('PAGE_PNG_DIR','pages-png')   # folder with 1.png ... 604.png
def load(p):
    im=cv2.imread(f'{SRC}/{p}.png',cv2.IMREAD_UNCHANGED)
    if im.shape[2]==4:
        a=im[:,:,3:4]/255.0; rgb=im[:,:,:3]*a+255*(1-a); im=rgb.astype(np.uint8)
    return im
def markers(p,dbg=False):
    im=load(p).astype(int)
    b,g,r=im[:,:,0],im[:,:,1],im[:,:,2]
    neutral=(abs(r-g)<10)&(abs(g-b)<10)&(r>150)&(r<235)
    m=neutral.astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    n,lab,st,cen=cv2.connectedComponentsWithStats(m,8)
    out=[]
    for i in range(1,n):
        x,y,w,h,a=st[i]
        if 26<=w<=48 and 26<=h<=48 and abs(w-h)<=6 and a>0.55*w*h:
            out.append((int(x),int(y),int(w),int(h)))
    return out
