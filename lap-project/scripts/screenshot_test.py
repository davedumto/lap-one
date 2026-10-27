import os
import asyncio, subprocess, sys
from playwright.async_api import async_playwright
SC='/tmp/claude-0/-home-claude/08039f2c-35fe-594b-919c-357edad57a83/scratchpad/'
CS=[float(x) for x in sys.argv[3].split(',')]
async def main():
    w,h=int(sys.argv[1]),int(sys.argv[2]); key='d' if w>800 else 'm'
    subprocess.run('fuser -k 8771/tcp',shell=True,stderr=subprocess.DEVNULL)
    srv=subprocess.Popen(['python3','-m','http.server','8771'],cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','dist'),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    await asyncio.sleep(1)
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader'])
        pg=await b.new_page(viewport={'width':w,'height':h})
        pg.on('pageerror',lambda e:print('err',e))
        pg.on('console',lambda m:print('console',m.text[:200]) if ('GL Driver' not in m.text and 'ERR_TUNNEL' not in m.text and 'fonts.g' not in m.text) else None)
        await pg.goto('http://localhost:8771/index.html#auto')
        await pg.wait_for_function("window.__ready===true",timeout=280000)
        print('ready; H',await pg.evaluate("document.documentElement.scrollHeight"),'overflowX',await pg.evaluate("document.documentElement.scrollWidth>innerWidth"))
        await pg.wait_for_timeout(4500)
        for c in CS:
            await pg.evaluate(f"window.__hold=false;window.__forceC={c};window.__wsm={sys.argv[4] if len(sys.argv)>4 else 'undefined'}")
            await pg.wait_for_timeout(2500)
            f0=await pg.evaluate("window.__frames")
            await pg.evaluate("window.__hold=true;window.__once=true")
            await pg.wait_for_function(f"window.__frames>{f0}",timeout=280000)
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=SC+f'lap_{key}_{c}.png'); print('shot',c)
        await b.close()
    srv.terminate()
asyncio.run(main())
