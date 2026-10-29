import math
from mark import tail
V=dict(turns=1.6,k=0.31,W=19,peak=0.34,base_w=0.6)
def parts(size):
    import mark
    d,pts=tail(**V)
    P=[tuple(map(float,p.split(","))) for p in d[1:-1].split(" L")]
    P=P[::2]  # halve the point count, still smooth at 1024px
    xs=[p[0] for p in P]; ys=[p[1] for p in P]
    x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys); s=size/max(x1-x0,y1-y0)
    ox=50-(x0+x1)/2*s; oy=50-(y0+y1)/2*s
    T=lambda x,y:(ox+x*s, oy+y*s)
    path="M"+" L".join("%.2f,%.2f"%T(x,y) for x,y in P)+"Z"
    n=len(pts)-1; tip=pts[n]; mid=pts[int(n*0.62)]
    cx,cy=T((tip[0]+mid[0])/2,(tip[1]+mid[1])/2)
    return path,cx,cy,round(5.2*size/64,2)
INK="#1d1b2e"; CORAL="#ff7a59"; LAV="#dcd8ff"
def svg(size, bg=None, rx=0, ink=INK):
    p,cx,cy,r=parts(size)
    b=f'<rect width="100" height="100" rx="{rx}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{b}<path d="{p}" fill="{ink}"/><circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r}" fill="{CORAL}"/></svg>'
open("mark.svg","w").write(svg(92))                 # bare mark, for the UI and wordmark
open("icon.svg","w").write(svg(64,LAV))             # app icon, full bleed (the OS rounds it)
open("maskable.svg","w").write(svg(54,LAV))         # inside the maskable safe circle
open("favicon.svg","w").write(svg(78,LAV,rx=24))    # tab icon: rounded, bigger glyph
print(len(open("mark.svg").read()))
