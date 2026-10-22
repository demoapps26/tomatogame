(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('view'), ctx = canvas.getContext('2d', { alpha: false });
  const map = [
    '1111111111111111',
    '1000000000000001',
    '1000000000000001',
    '1002200002200001',
    '1002200002200001',
    '1000000000000001',
    '1000000000000001',
    '1000022000022001',
    '1000022000022001',
    '1000000000000001',
    '1000000000000001',
    '1002200002200001',
    '1002200002200001',
    '1000000000000001',
    '1000000000000001',
    '1111111111111111'
  ];
  const TAU = Math.PI * 2, FOV = Math.PI / 2.8;
  const keys = new Set();
  let w, h, depth, state = 'menu', round = 1, totalKills = 0, enemies = [], shots = [];
  let player = { x: 8, y: 13.5, a: -Math.PI / 2, health: 100, ammo: 8 };
  let last = 0, elapsed = 0, cooldown = 0, reload = 0, recoil = 0, hurt = 0, hit = 0, noticeTimer = 0;
  let dragging = false, previousX = 0, walking = false;
  let mousePosition = null;
  const solid = (x, y) => map[Math.floor(y)]?.[Math.floor(x)] !== '0';
  function fits(x, y, radius = .2) {
    return !solid(x-radius,y-radius) && !solid(x+radius,y-radius) && !solid(x-radius,y+radius) && !solid(x+radius,y+radius);
  }
  function move(entity, dx, dy) {
    if (fits(entity.x + dx, entity.y)) entity.x += dx;
    if (fits(entity.x, entity.y + dy)) entity.y += dy;
  }
  function clearLine(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx-ax, by-ay) * 12);
    for (let i = 1; i < steps; i++) if (solid(ax+(bx-ax)*i/steps, ay+(by-ay)*i/steps)) return false;
    return true;
  }
  function resize() {
    w = canvas.width = Math.min(1100, Math.round(innerWidth));
    h = canvas.height = Math.round(w * innerHeight / innerWidth);
    depth = new Float32Array(w);
  }
  addEventListener('resize', resize); resize();
  function notice(text, duration = 3) { $('notice').textContent = text; noticeTimer = duration; }
  function hud() {
    $('round').textContent = `RONDA ${round} / 3`;
    $('health').textContent = Math.max(0, Math.ceil(player.health));
    $('health-bar').style.width = `${Math.max(0,player.health)}%`;
    $('ammo').textContent = reload > 0 ? '…' : player.ammo;
    $('enemies').textContent = enemies.filter(e => e.health > 0).length;
    $('kills').textContent = totalKills;
  }
  function prepareRound() {
    player = { x: 8, y: 13.5, a: -Math.PI/2, health: 100, ammo: 8 };
    const positions = [[8,8.7],[5,5.5],[12.7,3],[2,2],[13,13]];
    enemies = positions.slice(0,round+2).map(([x,y], i) => ({x,y,health:2, attack:2+i*.55, phase:i*1.9}));
    shots = []; cooldown = reload = recoil = hurt = hit = 0; keys.clear(); hud();
  }
  function lockMouse() {
    if (matchMedia('(pointer: coarse)').matches) return;
    try { const result = canvas.requestPointerLock?.(); if (result?.catch) result.catch(() => {}); } catch {}
  }
  function enter() {
    if (state === 'won' || state === 'lost') { round = 1; totalKills = 0; prepareRound(); }
    else if (state === 'round') { round++; prepareRound(); }
    else if (state === 'menu') prepareRound();
    state = 'playing'; mousePosition = null; document.body.className = 'playing'; last = performance.now();
    notice('Elimina os rivais. Dois impactos por adversário.', 5); lockMouse();
  }
  function screen(next, title, text, button) {
    state = next; keys.clear(); dragging = false; mousePosition = null;
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.className = 'menu';
    $('screen-title').textContent = title; $('screen-description').textContent = text;
    $('play').textContent = button;
  }
  function pause() {
    if (state === 'playing') screen('paused', 'Colheita em pausa.', 'Respira. A estufa continua à tua espera. Retoma para continuar esta ronda.', 'Retomar combate ↗');
  }
  function shoot() {
    if (state !== 'playing' || cooldown > 0 || reload > 0) return;
    if (player.ammo <= 0) { startReload(); return; }
    player.ammo--; cooldown = .32; recoil = 1;
    shots.push({x:player.x+Math.cos(player.a)*.35,y:player.y+Math.sin(player.a)*.35,vx:Math.cos(player.a)*10,vy:Math.sin(player.a)*10,age:0,enemy:false});
    hud(); if (!player.ammo) notice('Cesto vazio. Carrega R para recarregar.');
  }
  function startReload() {
    if (state !== 'playing' || reload > 0 || player.ammo === 8) return;
    reload = 1.35; notice('A encher o cesto…', 1.35); hud();
  }
  $('play').addEventListener('click', enter); $('pause').addEventListener('click', pause);
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (['w','a','s','d','arrowleft','arrowright','arrowup','arrowdown',' '].includes(key) && state === 'playing') { e.preventDefault(); keys.add(key); }
    if (e.repeat) return;
    if (key === 'r') startReload();
    if (key === 'p' || key === 'escape') { if (state === 'playing') pause(); else if (state === 'paused') enter(); }
    if (key === ' ') shoot();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  document.addEventListener('pointerlockchange', () => {
    mousePosition = null;
    if (!document.pointerLockElement && state === 'playing') pause();
  });
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'playing') return;
    if (e.pointerType === 'touch') {
      dragging = true; previousX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    } else {
      shoot();
      if (document.pointerLockElement !== canvas) lockMouse();
    }
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  document.addEventListener('mousemove', e => {
    if (state !== 'playing') return;
    if (document.pointerLockElement === canvas) {
      player.a += e.movementX * .0028;
    } else if (e.target === canvas) {
      if (mousePosition) player.a += (e.clientX - mousePosition.x) * .0028;
      mousePosition = { x: e.clientX };
    } else mousePosition = null;
  });
  canvas.addEventListener('pointerenter', e => {
    if (e.pointerType === 'mouse') mousePosition = { x: e.clientX };
  });
  canvas.addEventListener('pointerleave', () => { mousePosition = null; });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;
    if (state === 'playing' && dragging) player.a += (e.clientX-previousX)*.005;
    previousX = e.clientX;
  });
  document.querySelectorAll('[data-key]').forEach(button => {
    const release = () => keys.delete(button.dataset.key);
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); keys.add(button.dataset.key); });
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
  });
  $('mobile-fire').addEventListener('pointerdown', e => { e.preventDefault(); shoot(); });
  $('mobile-reload').addEventListener('click', startReload);
  function update(dt) {
    elapsed += dt; cooldown = Math.max(0,cooldown-dt); recoil = Math.max(0,recoil-dt*5); hurt = Math.max(0,hurt-dt*2); hit = Math.max(0,hit-dt*4);
    if (reload > 0) { reload -= dt; if (reload <= 0) { player.ammo = 8; notice('Cesto cheio. De volta ao combate.'); hud(); } }
    if (noticeTimer > 0) { noticeTimer -= dt; if (noticeTimer <= 0) $('notice').textContent = 'Usa os canteiros como cobertura.'; }
    if (keys.has('arrowleft')) player.a -= dt*1.9;
    if (keys.has('arrowright')) player.a += dt*1.9;
    const forward = (keys.has('w') || keys.has('arrowup') ? 1:0)-(keys.has('s') || keys.has('arrowdown') ? 1:0);
    const side = (keys.has('d') ? 1:0)-(keys.has('a') ? 1:0), length = Math.max(1,Math.hypot(forward,side));
    walking = !!(forward || side);
    move(player,(Math.cos(player.a)*forward-Math.sin(player.a)*side)/length*dt*2.7,(Math.sin(player.a)*forward+Math.cos(player.a)*side)/length*dt*2.7);
    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      const dx = player.x-enemy.x, dy = player.y-enemy.y, distance = Math.hypot(dx,dy);
      const visible = clearLine(enemy.x,enemy.y,player.x,player.y);
      if (distance > 3 || !visible) move(enemy,dx/Math.max(distance,.1)*dt*.65,dy/Math.max(distance,.1)*dt*.65);
      else { const strafe = Math.sin(elapsed+enemy.phase)*dt*.35; move(enemy,-dy/distance*strafe,dx/distance*strafe); }
      enemy.attack -= dt;
      if (enemy.attack <= 0 && visible && distance < 11) {
        const aim = Math.atan2(dy,dx) + (Math.random()-.5)*.15;
        shots.push({x:enemy.x,y:enemy.y,vx:Math.cos(aim)*3.4,vy:Math.sin(aim)*3.4,age:0,enemy:true});
        enemy.attack = 2.8-round*.25 + Math.random();
      }
    }
    for (const shot of shots) {
      const substeps = Math.max(1,Math.ceil(Math.hypot(shot.vx,shot.vy)*dt/.12));
      for (let step=0;step<substeps && !shot.dead;step++) {
        shot.x += shot.vx*dt/substeps; shot.y += shot.vy*dt/substeps;
        if (solid(shot.x,shot.y)) { shot.dead = true; break; }
        if (shot.enemy) {
          if (Math.hypot(shot.x-player.x,shot.y-player.y) < .3) { player.health -= 17; hurt = 1; shot.dead = true; hud(); }
        } else for (const enemy of enemies) {
          if (enemy.health > 0 && Math.hypot(shot.x-enemy.x,shot.y-enemy.y) < .36) {
            enemy.health--; shot.dead = true; hit = 1;
            if (enemy.health <= 0) { totalKills++; notice('Rival eliminado. Boa tomatada!'); } else notice('Impacto! Mais um tomate para eliminar.');
            hud(); break;
          }
        }
      }
      shot.age += dt; if (shot.age > 4) shot.dead = true;
    }
    shots = shots.filter(s => !s.dead);
    $('hit').style.opacity = hit; $('hurt').style.opacity = hurt*.65;
    if (player.health <= 0) screen('lost','Ficaste feito em polpa.',`Conseguiste ${totalKills} eliminações. Usa as bancadas como cobertura e desvia-te dos tomates rivais.`, 'Tentar novamente ↗');
    else if (enemies.every(e => e.health <= 0)) {
      if (round === 3) screen('won','Estufa conquistada!',`Venceste as três rondas com ${totalKills} eliminações. A colheita está a salvo.`, 'Jogar novamente ↗');
      else screen('round',`Ronda ${round} conquistada.`, 'A próxima equipa rival já está a entrar. Recebes vida e um cesto cheio para a próxima ronda.', 'Próxima ronda ↗');
    }
  }
  function tomato(context,x,y,r,enemy=false) {
    context.fillStyle = enemy ? '#ffb046' : '#ef4f30'; context.beginPath(); context.ellipse(x,y,r,r*.86,0,0,TAU);context.fill();
    context.fillStyle = '#ffffff66';context.beginPath();context.ellipse(x-r*.3,y-r*.25,r*.18,r*.1,-.5,0,TAU);context.fill();
    context.fillStyle = '#34673d';context.beginPath();context.moveTo(x,y-r*.55);context.lineTo(x-r*.65,y-r);context.lineTo(x-r*.1,y-r*.85);context.lineTo(x+r*.18,y-r*1.35);context.lineTo(x+r*.3,y-r*.75);context.lineTo(x+r*.65,y-r*.7);context.closePath();context.fill();
  }
  const botSprite = document.createElement('canvas'); botSprite.width=128;botSprite.height=192;
  const b=botSprite.getContext('2d');
  b.fillStyle='#13271d'; b.fillRect(35,135,22,48);b.fillRect(70,135,22,48);b.fillStyle='#283f29';b.fillRect(27,173,31,14);b.fillRect(69,173,31,14);
  b.fillStyle='#d18a45'; b.beginPath();b.roundRect(21,68,85,77,17);b.fill();b.fillStyle='#38563a';b.fillRect(33,82,61,61);b.fillStyle='#9fbe79';b.fillRect(43,92,17,24);b.fillRect(66,92,17,24);
  b.fillStyle='#e8b18b';b.beginPath();b.arc(64,46,26,0,TAU);b.fill();b.fillStyle='#374f36';b.beginPath();b.ellipse(64,28,33,15,0,0,TAU);b.fill();b.fillStyle='#172b22';b.fillRect(42,41,45,11);b.fillStyle='#b3d6c1';b.fillRect(47,44,12,4);b.fillRect(70,44,12,4);
  b.strokeStyle='#dc9d72';b.lineWidth=17;b.lineCap='round';b.beginPath();b.moveTo(25,85);b.lineTo(36,114);b.lineTo(65,104);b.moveTo(103,87);b.lineTo(95,109);b.stroke();tomato(b,81,101,15,true);
  function render() {
    const horizon = h*.46 + (walking && state === 'playing' ? Math.sin(elapsed*10)*h*.003:0);
    const sky = ctx.createLinearGradient(0,0,0,horizon); sky.addColorStop(0,'#577c77');sky.addColorStop(1,'#c9d8b8');ctx.fillStyle=sky;ctx.fillRect(0,0,w,horizon);
    const ground=ctx.createLinearGradient(0,horizon,0,h);ground.addColorStop(0,'#7a8964');ground.addColorStop(1,'#3c4e38');ctx.fillStyle=ground;ctx.fillRect(0,horizon,w,h-horizon);
    ctx.strokeStyle='#d5e3ce55';ctx.lineWidth=2;
    const shift = (player.a / TAU * w * 3) % (w*.35);
    for(let i=-6;i<9;i++){const x=i*w*.35-shift;ctx.beginPath();ctx.moveTo(w/2+(x-w/2)*.06,horizon);ctx.lineTo(x,-20);ctx.stroke();}
    for(const y of [.07,.19,.33,.42]){ctx.beginPath();ctx.moveTo(0,h*y);ctx.lineTo(w,h*y);ctx.stroke();}
    const projection = w/(2*Math.tan(FOV/2));
    for(let x=0;x<w;x+=2){
      const cameraX=(x-w/2)/projection, angle=player.a+Math.atan(cameraX), dx=Math.cos(angle),dy=Math.sin(angle);
      let mx=Math.floor(player.x),my=Math.floor(player.y),side=0,dist=0,cell='1';
      const deltaX=Math.abs(1/dx),deltaY=Math.abs(1/dy),stepX=dx<0?-1:1,stepY=dy<0?-1:1;
      let sx=(dx<0?player.x-mx:mx+1-player.x)*deltaX,sy=(dy<0?player.y-my:my+1-player.y)*deltaY;
      for(let i=0;i<50;i++){if(sx<sy){dist=sx;sx+=deltaX;mx+=stepX;side=0;}else{dist=sy;sy+=deltaY;my+=stepY;side=1;}cell=map[my]?.[mx]||'1';if(cell!=='0')break;}
      const corrected=Math.max(.06,dist*Math.cos(angle-player.a));depth[x]=depth[Math.min(x+1,w-1)]=corrected;
      const height=projection/corrected, top=horizon-height*.62, bottom=horizon+height*.38;
      const hitPos=side ? player.x+dist*dx:player.y+dist*dy, fraction=hitPos-Math.floor(hitPos), shade=Math.max(.25,1-corrected/23)*(side?.85:1);
      if(cell==='1'){
        ctx.fillStyle=`rgb(${100*shade},${153*shade},${139*shade})`;ctx.fillRect(x,top,2,bottom-top);
        ctx.fillStyle=`rgba(207,227,195,${.18*shade})`;ctx.fillRect(x,top+height*.1,2,height*.36);
        if(fraction<.045||fraction>.955){ctx.fillStyle='#365b4c';ctx.fillRect(x,top,2,bottom-top);}
        ctx.fillStyle='#466b56';ctx.fillRect(x,top+height*.48,2,Math.max(2,height*.025));ctx.fillRect(x,bottom-height*.1,2,height*.1);
      }else{
        ctx.fillStyle=`rgb(${54*shade},${95*shade},${45*shade})`;ctx.fillRect(x,top,2,height*.54);
        const leaf=Math.sin(fraction*38+mx*my)*.06*height;
        ctx.fillStyle=`rgb(${72*shade},${121*shade},${48*shade})`;ctx.fillRect(x,top+leaf,2,height*.35);
        if(Math.sin(fraction*33+mx)> .77){ctx.fillStyle=`rgb(${218*shade},${69*shade},${35*shade})`;ctx.fillRect(x,top+height*.15,2,height*.07);}
        ctx.fillStyle=`rgb(${121*shade},${94*shade},${58*shade})`;ctx.fillRect(x,top+height*.54,2,height*.46);
        ctx.fillStyle='#b09a6d';ctx.fillRect(x,top+height*.54,2,height*.025);
      }
    }
    const sprites = enemies.filter(e=>e.health>0).map(e=>({...e,kind:'bot'})).concat(shots.map(s=>({...s,kind:'shot'})));
    sprites.sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y));
    for(const sprite of sprites){
      const dx=sprite.x-player.x,dy=sprite.y-player.y,forward=dx*Math.cos(player.a)+dy*Math.sin(player.a),side=-dx*Math.sin(player.a)+dy*Math.cos(player.a);
      if(forward<.15)continue;
      const center=w/2+side/forward*projection, size=projection/forward, sh=size*(sprite.kind==='bot'?.95:.16),sw=sh*(sprite.kind==='bot'?2/3:1.15);
      const top=sprite.kind==='bot'?horizon-size*.56:horizon-size*.08-Math.sin(sprite.age*6)*size*.035;
      if(center+sw/2<0||center-sw/2>w)continue;
      if(sprite.kind==='bot'){
        for(let px=Math.max(0,Math.floor(center-sw/2));px<Math.min(w,center+sw/2);px+=2){if(forward<depth[px]+.1){const u=(px-(center-sw/2))/sw*128;ctx.drawImage(botSprite,Math.max(0,Math.min(126,u)),0,2,192,px,top,2,sh);}}
      }else if(forward<depth[Math.max(0,Math.min(w-1,Math.round(center)))]+.1)tomato(ctx,center,top,sw/2,sprite.enemy);
    }
    // The player's hand and tomato stay in view, with a throwing animation.
    const scale=Math.min(w,h)*.52,bob=walking&&state==='playing'?Math.sin(elapsed*10)*5:0;
    ctx.save();ctx.translate(w*.69,h+recoil*70+bob);ctx.rotate(-.25+recoil*.65);
    ctx.fillStyle='#2d503b';ctx.beginPath();ctx.roundRect(-scale*.2,-scale*.26,scale*.45,scale*.7,20);ctx.fill();
    ctx.fillStyle='#dca27c';ctx.beginPath();ctx.ellipse(0,-scale*.29,scale*.16,scale*.22,-.2,0,TAU);ctx.fill();
    if(player.ammo>0&&reload<=0)tomato(ctx,-scale*.01,-scale*.49,scale*.19);
    ctx.restore();
    const vignette=ctx.createRadialGradient(w/2,h/2,h*.2,w/2,h/2,w*.75);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#06180d88');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
  }
  function frame(now) {
    const dt=Math.min(.04,Math.max(0,(now-last)/1000));last=now;
    if(state==='playing')update(dt);
    render();requestAnimationFrame(frame);
  }
  document.body.className='menu';prepareRound();requestAnimationFrame(frame);
})();
