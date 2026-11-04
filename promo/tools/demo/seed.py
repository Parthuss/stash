"""Seed the local demo account "Maya" with 6 notes (covers, a used note, ticked list items). Prints her token.
Run via ./demo.sh, which starts the local worker first."""
import httpx, base64, json, os, time
B="http://localhost:8799"; adm={"X-Stash-Secret":"adm"}; C=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'covers') + '/'
c=httpx.Client(base_url=B)
u=c.post("/admin/users",headers=adm,json={"name":"Maya"}).json(); h={"Authorization":"Bearer "+u["token"]}
def md(title, summary, nxt, ing=None, steps=None, ment=None):
    s=[f"# {title}","",summary,"","## Next step","",nxt]
    if ing: s+=["","## Ingredients",""]+[f"- {x}" for x in ing]
    if steps: s+=["","## Steps",""]+[f"{i+1}. {x}" for i,x in enumerate(steps)]
    if ment: s+=["","## Mentioned",""]+[f"- **{t.title()}:** {n}" for t,n in ment]
    return "\n".join(s)
notes=[
 ("mobility","Morning mobility routine, 10 minutes","fitness","Six moves for stiff hips and back, done on the floor before coffee.","Do it tomorrow before you check your phone. Set a 10-minute timer.",None,["Cat-cow, 10 slow reps","90/90 hip switches, 8 per side","World's greatest stretch, 5 per side"],None),
 ("budget","The 50/30/20 budget, explained in 60 seconds","money","Split take-home pay into needs, wants and savings, and automate the savings part on payday.","Set up an automatic transfer of 20% to savings for the day after payday.",None,None,[("book","I Will Teach You to Be Rich")]),
 ("movies","5 slow movies that are worth the patience","inspiration","Quiet films with big payoffs, picked by a film critic.","Pick one for Friday night. Past Lives is the easiest start.",None,None,[("movie","Past Lives"),("movie","Perfect Days"),("movie","Aftersun"),("movie","Columbus"),("movie","Paterson")]),
 ("tokyo","Tokyo in 3 days on a budget","travel","A day-by-day plan: Shibuya and Harajuku, Asakusa and Ueno, then a day trip to Kamakura. Most of it under ¥5,000 a day.","Book the JR pass before you fly, it's cheaper outside Japan.",None,None,[("place","Senso-ji, Asakusa"),("place","Café Kitsuné, Aoyama"),("place","Kamakura Great Buddha")]),
 ("books","5 books that changed how I think about habits","learning","A reader's top picks on habits and focus, with one line on why each matters.","Start with Atomic Habits. The 2-minute rule chapter is the one people quote.",None,None,[("book","Atomic Habits"),("book","Deep Work"),("book","The Psychology of Money"),("book","Four Thousand Weeks")]),
 ("pasta","Garlic butter pasta in 15 minutes","food","One-pan weeknight pasta. The trick is cooking the garlic low and slow so it goes sweet, not bitter.","Make it tonight. You probably have everything but the parmesan.",
   ["200g spaghetti","4 cloves garlic, thinly sliced","3 tbsp butter","1 tsp chilli flakes","40g parmesan, grated","A handful of parsley"],
   ["Boil the spaghetti in well-salted water.","Melt the butter on low heat and add the garlic. Cook 3–4 minutes until soft and golden.","Add the chilli flakes.","Toss in the pasta with a splash of pasta water.","Finish with parmesan and parsley."],None),
]
for i,(cov,title,topic,summary,nxt,ing,steps,ment) in enumerate(notes):
    cap=c.post("/v1/ingest",headers=h,json={"url":f"https://www.instagram.com/reel/DEMO{i}xyz/"}).json()["id"]
    c.post("/claim",headers=adm)
    body={"capture_id":cap,"user_id":u["id"],"title":title,"summary":summary,"topic":topic,"tools":[],
          "markdown":md(title,summary,nxt,ing,steps,ment),"mentions":[{"type":t,"name":n} for t,n in (ment or [])],
          "permalink":f"https://www.instagram.com/reel/DEMO{i}xyz/","thumb":base64.b64encode(open(C+cov+".jpg","rb").read()).decode()}
    nid=c.post("/note",headers=adm,json=body).json()["id"]
    c.post("/complete",headers=adm,json={"id":cap,"ok":True})
    if cov in ("books",): c.post(f"/v1/notes/{nid}/used",headers=h)
    time.sleep(1.1)
c.post("/v1/mentions/done",headers=h,json={"type":"book","name":"Atomic Habits","done":True})
c.post("/v1/mentions/done",headers=h,json={"type":"movie","name":"Past Lives","done":True})
print(u["token"])
