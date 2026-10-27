import os, shutil
os.chdir(os.path.dirname(os.path.abspath(__file__)))
out='Wallboard-Installer'
readme=open(f'{out}/LIESMICH.txt',encoding='utf-8-sig').read() if os.path.exists(f'{out}/LIESMICH.txt') else None
if os.path.exists(out): shutil.rmtree(out)
os.makedirs(out)
for f in ['install.ps1','uninstall.ps1']:
    t=open('src/'+f).read().replace('\r\n','\n').replace('\n','\r\n')
    open(f'{out}/{f}','w',encoding='utf-8-sig',newline='').write(t)
for f in ['Installieren.cmd','Deinstallieren.cmd']: shutil.copy('src/'+f, f'{out}/{f}')
shutil.copytree('Wallboard/app', f'{out}/Wallboard/app')
shutil.copy('Wallboard/launcher.js', f'{out}/Wallboard/launcher.js')
open(f'{out}/LIESMICH.txt','w',encoding='utf-8-sig',newline='').write(open('src/LIESMICH.txt',encoding='utf-8').read().replace('\r\n','\n').replace('\n','\r\n'))
if os.path.exists('/mnt/project-files/wallboard/Wallboard-Installer.zip'): os.remove('/mnt/project-files/wallboard/Wallboard-Installer.zip')
shutil.make_archive('/mnt/project-files/wallboard/Wallboard-Installer','zip','.',out)
print('ok')
