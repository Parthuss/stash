import math, sys
def tail(turns=1.45, k=0.33, W=17.0, cx=54, cy=44, R=40, rot=-0.5, peak=0.38, base_w=2.2, tip_w=1.0):
    # centreline: log spiral from the outside (base, bottom-left) curling inward clockwise
    n=400; th1=turns*2*math.pi
    pts=[]
    for i in range(n+1):
        t=i/n; th=t*th1
        r=R*math.exp(-k*th)
        a=rot+math.pi*0.5+th   # start at bottom, turn clockwise on screen (y down)
        pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
    # width profile: thin at base, swells, thins to the tip
    def w(t):
        if t<peak: s=math.sin(t/peak*math.pi/2)**0.9; return base_w+(W-base_w)*s
        s=math.cos((t-peak)/(1-peak)*math.pi/2)**0.75; return tip_w+(W-tip_w)*s
    L=[];Rt=[]
    for i,(x,y) in enumerate(pts):
        a=pts[max(i-1,0)]; b=pts[min(i+1,n)]
        dx,dy=b[0]-a[0],b[1]-a[1]; d=math.hypot(dx,dy) or 1
        nx,ny=-dy/d,dx/d; h=w(i/n)/2
        L.append((x+nx*h,y+ny*h)); Rt.append((x-nx*h,y-ny*h))
    poly=L+Rt[::-1]
    d="M"+" L".join(f"{x:.2f},{y:.2f}" for x,y in poly)+"Z"
    return d, pts
if __name__=="__main__":
    d,pts=tail()
    print(d)
