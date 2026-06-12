/* ╔══════════════════════════════════════════════════════════════════╗
   ║  MG-Sense — MODULO OCULARE (ptosi via MediaPipe Face Landmarker)   ║
   ║                                                                    ║
   ║  Sostituisce il vecchio metodo "pixel scuri" con il rilevamento    ║
   ║  dei landmark del volto. Misure:                                   ║
   ║    • EAR (Eye Aspect Ratio): apertura verticale / larghezza occhio ║
   ║      → adimensionale, indipendente da fotocamera/distanza.         ║
   ║    • Rima palpebrale (PFH) e MRD in mm, ancorate al diametro        ║
   ║      dell'iride (≈ 11,7 mm) usato come righello.                    ║
   ║    • Scarto degli ammiccamenti, controllo dello sguardo in alto,    ║
   ║      calo nel tempo sotto sguardo sostenuto (ptosi affaticabile).   ║
   ║                                                                    ║
   ║  COME INTEGRARE: sostituisci l'INTERO blocco «MODULO OCULARE» in    ║
   ║  index.html (dal commento `MODULO OCULARE …` fino alla fine di      ║
   ║  `function eyeCard(){…}`) con tutto il contenuto di questo file.    ║
   ║                                                                    ║
   ║  NOTE: al primo avvio scarica ~3 MB (wasm + modello) da CDN; serve  ║
   ║  http/https (non file://). Dopo il primo caricamento il service     ║
   ║  worker mette in cache gli asset → funziona anche offline.          ║
   ╚══════════════════════════════════════════════════════════════════╝ */

/* ============================================================
   MODULO OCULARE — fatigability test con MediaPipe Face Landmarker
   Rilevamento on-device dei 478 landmark del volto (iride inclusa).
   Dall'EAR e dalla rima palpebrale ancorata all'iride si stima la
   ptosi e il suo peggioramento sotto sguardo sostenuto in alto.
   Fallback simulato se fotocamera o modello non sono disponibili.
   ============================================================ */

/* ---- caricamento pigro del modello (una sola volta, poi riusato) ---- */
const FACE_WASM ='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm';
const FACE_LIB  ='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/+esm';
const FACE_MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
let faceLM=null, faceLMLoading=null;
async function ensureFaceLandmarker(){
  if(faceLM) return faceLM;
  if(faceLMLoading) return faceLMLoading;
  faceLMLoading=(async()=>{
    const vision=await import(FACE_LIB);
    const { FaceLandmarker, FilesetResolver }=vision;
    const fileset=await FilesetResolver.forVisionTasks(FACE_WASM);
    const opts=(delegate)=>({
      baseOptions:{ modelAssetPath:FACE_MODEL, delegate },
      runningMode:'VIDEO', numFaces:1,
      outputFaceBlendshapes:false, outputFacialTransformationMatrixes:false
    });
    try{ faceLM=await FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch(_){ faceLM=await FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
    return faceLM;
  })();
  try{ return await faceLMLoading; }
  catch(e){ faceLMLoading=null; throw e; }
}

/* ---- indici dei landmark (Face Mesh / iride) ---- */
const EYE={
  R:{ outer:33,  inner:133, upper:159, lower:145, vt:[[160,144],[158,153]], irisC:468, irisH:[469,471] },
  L:{ inner:362, outer:263, upper:386, lower:374, vt:[[385,380],[387,373]], irisC:473, irisH:[474,476] },
};
function P(lm,i,vw,vh){ const p=lm[i]; return [p.x*vw, p.y*vh]; }   // normalizzato → pixel
function D(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }

// EAR di un occhio: (media delle distanze verticali) / (larghezza orizzontale)
function earEye(lm,e,vw,vh){
  const wdt=D(P(lm,e.outer,vw,vh), P(lm,e.inner,vw,vh));
  let v=0; for(const [a,b] of e.vt) v+=D(P(lm,a,vw,vh), P(lm,b,vw,vh));
  v/=e.vt.length;
  return wdt>0 ? v/wdt : 0;
}

// Analisi di un fotogramma: EAR, rima e MRD in mm (ancorati all'iride), sguardo
function analyzeEyeFrame(lm, vw, vh){
  const earR=earEye(lm,EYE.R,vw,vh), earL=earEye(lm,EYE.L,vw,vh);
  const ear=(earR+earL)/2;
  // diametro orizzontale dell'iride → righello pixel→mm (HVID ≈ 11,7 mm)
  const irisR=D(P(lm,EYE.R.irisH[0],vw,vh), P(lm,EYE.R.irisH[1],vw,vh));
  const irisL=D(P(lm,EYE.L.irisH[0],vw,vh), P(lm,EYE.L.irisH[1],vw,vh));
  const irisPx=(irisR+irisL)/2;
  const mmPerPx=irisPx>0 ? 11.7/irisPx : 0;
  // rima palpebrale: distanza margine sup–inf al centro dell'occhio
  const pfhR=D(P(lm,EYE.R.upper,vw,vh), P(lm,EYE.R.lower,vw,vh));
  const pfhL=D(P(lm,EYE.L.upper,vw,vh), P(lm,EYE.L.lower,vw,vh));
  const pfhMm=((pfhR+pfhL)/2)*mmPerPx;
  // MRD: centro pupilla → margine palpebrale superiore (positivo se palpebra sopra la pupilla)
  const mrdR=(P(lm,EYE.R.irisC,vw,vh)[1]-P(lm,EYE.R.upper,vw,vh)[1])*mmPerPx;
  const mrdL=(P(lm,EYE.L.irisC,vw,vh)[1]-P(lm,EYE.L.upper,vw,vh)[1])*mmPerPx;
  const mrdMm=(mrdR+mrdL)/2;
  // sguardo verticale: posizione del centro iride nell'apertura (0=alto, 1=basso)
  const gz=(e)=>{ const up=P(lm,e.upper,vw,vh)[1], lo=P(lm,e.lower,vw,vh)[1], c=P(lm,e.irisC,vw,vh)[1]; const s=lo-up; return s>1?(c-up)/s:0.5; };
  const gaze=(gz(EYE.R)+gz(EYE.L))/2;
  return { ok:true, ear, earR, earL, pfhMm, mrdMm, irisPx, gaze, gazeUp:gaze<0.42, asym:Math.abs(earR-earL) };
}

/* ---- aggregazione dei biomarcatori della sessione ---- */
function computeEyeBiomarkers(){
  const all=eyeTest.frames.filter(f=>f.ok);
  const F=all.filter(f=>!f.blink);                  // frame validi (no ammiccamenti)
  if(F.length<10) return {ok:false, faceFrac: all.length? all.length/eyeTest.frames.length : 0};
  const mean=(arr,k)=>arr.reduce((s,f)=>s+f[k],0)/arr.length;
  const n=Math.max(6, Math.round(F.length*0.15));
  const base=F.slice(0,n), end=F.slice(-n);
  const baseEAR=mean(base,'ear'), endEAR=mean(end,'ear');
  const basePFH=mean(base,'pfhMm'), endPFH=mean(end,'pfhMm');
  const endMRD=mean(end,'mrdMm');
  const declEAR=baseEAR>0?(baseEAR-endEAR)/baseEAR*100:0;
  const declPFH=basePFH>0?(basePFH-endPFH)/basePFH*100:0;
  const minPFH=Math.min(...F.map(f=>f.pfhMm));
  const minEAR=Math.min(...F.map(f=>f.ear));
  const asym=mean(F,'asym');
  // ammiccamenti: transizioni verso lo stato "blink"
  let blinks=0; for(let i=1;i<all.length;i++){ if(all[i].blink && !all[i-1].blink) blinks++; }
  const dur=all.length?all[all.length-1].t:0;
  const blinkRate=dur>0?blinks/dur*60:0;
  const upFrac=all.length? all.filter(f=>f.gazeUp).length/all.length : 0;
  return {ok:true, baseEAR, endEAR, basePFH, endPFH, endMRD, declEAR, declPFH,
          minPFH, minEAR, asym, blinks, blinkRate, upFrac, dur,
          earContour:F.map(f=>f.ear)};
}

/* ---- interpretazione (soglie indicative, non diagnostiche) ---- */
function eyeInterpretBio(m){
  if(!m.ok) return {tone:'warn', txt:'Volto non rilevato a sufficienza: avvicina il viso, illumina bene la stanza e tieni il telefono fermo all\'altezza degli occhi, poi ripeti.'};
  if(m.upFrac<0.4) return {tone:'warn', txt:'Sguardo non mantenuto verso l\'alto per gran parte del test: ripeti fissando il punto in cima allo schermo, così la manovra provoca davvero la ptosi affaticabile.'};
  const flags=[];
  if(m.declPFH>=20 || m.declEAR>=20) flags.push('apertura in calo durante lo sguardo in alto');
  if(m.endPFH>0 && m.endPFH<6) flags.push('rima palpebrale ridotta a fine test');
  if(m.asym>=0.06) flags.push('asimmetria tra i due occhi');
  const strong=(m.declPFH>=35)||(m.declEAR>=35)||(m.endPFH>0 && m.endPFH<4.5);
  let tone='ok', txt='Apertura palpebrale stabile durante lo sguardo prolungato in alto: nessuna ptosi affaticabile significativa.';
  if(strong){ tone='alert'; txt='Calo marcato e progressivo dell\'apertura palpebrale sotto sguardo sostenuto ('+flags.join(', ')+'): ptosi affaticabile evidente, da segnalare al centro di riferimento.'; }
  else if(flags.length){ tone='warn'; txt='Riduzione moderata dell\'apertura ('+flags.join(', ')+'): lieve ptosi affaticabile da monitorare nei prossimi giorni.'; }
  return {tone,txt};
}

/* ---- stato del modulo ---- */
const eyeTest={
  phase:'idle', source:null, duration:60,
  stream:null, frames:[], gotFrames:0,
  t0:0, raf:null, lastVideoTime:-1, modelReady:false, status:'',
};

/* ---- acquisizione live (fotocamera + modello) ---- */
function eyeTick(){
  if(eyeTest.phase!=='running') return;
  const v=document.getElementById('eyeVideo');
  const elapsed=(performance.now()-eyeTest.t0)/1000;
  if(v && v.readyState>=2 && v.videoWidth>0 && eyeTest.modelReady && faceLM){
    if(v.currentTime!==eyeTest.lastVideoTime){
      eyeTest.lastVideoTime=v.currentTime;
      let res=null;
      try{ res=faceLM.detectForVideo(v, performance.now()); }catch(_){}
      if(res && res.faceLandmarks && res.faceLandmarks.length){
        const a=analyzeEyeFrame(res.faceLandmarks[0], v.videoWidth, v.videoHeight);
        a.blink=a.ear<0.15;            // ammiccamento: EAR molto basso
        a.t=elapsed;
        eyeTest.frames.push(a);
        eyeTest.gotFrames++;
      }else{
        eyeTest.frames.push({ok:false, t:elapsed, ear:0, pfhMm:0, mrdMm:0, gaze:0.5, gazeUp:false, asym:0, blink:false});
      }
    }
  }
  if(elapsed>=eyeTest.duration){ eyeStop(); return; }
  updateEyeLive(elapsed);
}

/* ---- demo simulata: ptosi affaticabile + ammiccamenti sporadici ---- */
function eyeTickSim(){
  if(eyeTest.phase!=='running') return;
  const elapsed=(performance.now()-eyeTest.t0)/1000, frac=elapsed/eyeTest.duration;
  const blink=Math.sin(elapsed*2.1)>0.985;
  let ear,pfh,mrd;
  if(blink){ ear=0.07; pfh=1.5; mrd=0.2; }
  else{
    ear=Math.max(0.12, 0.33-0.16*Math.pow(frac,1.3)+(Math.random()-0.5)*0.015);
    pfh=Math.max(3.5, 9.2-4.2*Math.pow(frac,1.3)+(Math.random()-0.5)*0.3);
    mrd=Math.max(0.5, 3.6-2.4*Math.pow(frac,1.3)+(Math.random()-0.5)*0.2);
  }
  eyeTest.frames.push({ok:true, ear, earR:ear, earL:ear*0.96, pfhMm:pfh, mrdMm:mrd, irisPx:60, gaze:0.3, gazeUp:true, asym:ear*0.04, blink, t:elapsed});
  if(elapsed>=eyeTest.duration){ eyeStop(); return; }
  updateEyeLive(elapsed);
}

function updateEyeLive(elapsed){
  const el=document.getElementById('eyeLive');
  if(!el) return;
  const F=eyeTest.frames.filter(f=>f.ok && !f.blink);
  const last=F.length?F[F.length-1]:null;
  const set=(id,val)=>{ const x=el.querySelector(id); if(x) x.textContent=val; };
  set('#eyeTime', elapsed.toFixed(0)+'s / '+eyeTest.duration+'s');
  const bar=el.querySelector('#eyeBar'); if(bar) bar.style.width=Math.min(100,elapsed/eyeTest.duration*100)+'%';
  set('#eyeEAR', last?last.ear.toFixed(2):'—');
  set('#eyePFH', last?last.pfhMm.toFixed(1)+' mm':'—');
  const st=el.querySelector('#eyeStatus');
  if(st) st.textContent = eyeTest.source==='sim' ? 'demo simulata'
    : !eyeTest.modelReady ? (eyeTest.status||'caricamento modello…')
    : (F.length>0 ? `volto rilevato · ${F.length} frame` : 'inquadra il viso e guarda il punto in alto…');
  const sl=el.querySelector('#eyeSpark');
  if(sl && F.length>1){ const c=F.map(f=>f.ear); sl.innerHTML=spark(c, c[0], C.primary, 50, 300); }
}

function eyeFreeHW(){
  if(eyeTest.raf){ clearInterval(eyeTest.raf); eyeTest.raf=null; }
  if(eyeTest.stream){ eyeTest.stream.getTracks().forEach(t=>t.stop()); eyeTest.stream=null; }
  // il modello (faceLM) NON viene chiuso: resta pronto per i test successivi
}

async function eyeStart(){
  Object.assign(eyeTest,{phase:'running', source:null, frames:[], gotFrames:0,
    t0:performance.now(), lastVideoTime:-1, modelReady:false, status:'caricamento modello…'});
  render(); // crea la card live con l'elemento <video>

  // 1) fotocamera
  try{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-media');
    eyeTest.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
    eyeTest.source='camera';
    const v=document.getElementById('eyeVideo');
    if(v){ v.srcObject=eyeTest.stream; await v.play().catch(()=>{}); }
  }catch(_){
    eyeTest.source='sim'; eyeTest.t0=performance.now();
    eyeTest.raf=setInterval(eyeTickSim,80);
    render(); return;
  }

  // 2) modello Face Landmarker (al primo avvio scarica gli asset)
  try{
    updateEyeLive(0);
    await ensureFaceLandmarker();
    eyeTest.modelReady=true;
    eyeTest.t0=performance.now(); eyeTest.lastVideoTime=-1;
    eyeTest.raf=setInterval(eyeTick,60);
  }catch(e){
    // modello non caricabile (offline al primo uso, rete bloccata…) → demo simulata
    eyeFreeHW();
    eyeTest.source='sim'; eyeTest.t0=performance.now();
    eyeTest.raf=setInterval(eyeTickSim,80);
    render();
  }
}

function eyeStop(abort){
  eyeFreeHW();
  eyeTest.phase=abort===true?'idle':'done';
  render();
}
function eyeReset(){ eyeTest.phase='idle'; eyeTest.frames=[]; render(); }

/* ---- schede UI ---- */
function eyeCard(){
  const s=testSteps[0];

  if(eyeTest.phase==='idle'){
    const fileProto=location.protocol==='file:';
    const note = fileProto
      ? `<div style="margin-top:10px;font-size:12px;color:var(--warn);line-height:1.5;">⚠ Pagina aperta da <b>file://</b>: la fotocamera e il caricamento del modello sono bloccati. Per la misura reale apri la pagina via <b>http/https</b>. In assenza parte una <b>demo simulata</b>.</div>`
      : `<div style="margin-top:10px;font-size:12px;color:var(--inkSoft);line-height:1.5;">Al primo avvio vengono scaricati ~3 MB (modello di riconoscimento del volto); poi restano in cache anche offline. Il browser chiederà l'accesso alla fotocamera: tocca <b>Consenti</b>.</div>`;
    return `
      <div class="card" style="margin-top:16px;padding:20px;text-align:center;">
        <div aria-hidden="true" style="font-size:44px;">${s.icon}</div>
        <div style="margin-top:10px;"><span class="badge neutral">${s.sensor} frontale · Face Landmarker</span></div>
        <div style="margin-top:12px;font-weight:700;font-size:15px;">${s.label}</div>
        <div style="margin-top:8px;font-size:13.5px;color:var(--inkSoft);line-height:1.55;">
          Tieni il telefono all'altezza degli occhi e <b>fissa il punto in cima allo schermo</b> per ${eyeTest.duration} secondi, senza abbassare lo sguardo. L'app misura l'apertura della palpebra (EAR e rima in mm, calibrata sull'iride) e il suo calo progressivo — il segno della ptosi affaticabile nella miastenia.
        </div>
        ${note}
        <button class="btn primary full" style="margin-top:16px;" onclick="eyeStart()">Avvia test oculare</button>
      </div>`;
  }

  if(eyeTest.phase==='running'){
    const visual = eyeTest.source==='sim'
      ? `<div aria-hidden="true" style="height:150px;margin-top:12px;border-radius:10px;display:grid;place-items:center;background:repeating-linear-gradient(45deg,#EDF3F4,#EDF3F4 10px,#E5EDEF 10px,#E5EDEF 20px);border:1px dashed #9AB3B9;font-size:40px;">👁️</div>`
      : `<video id="eyeVideo" playsinline muted autoplay style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;background:#15262C;transform:scaleX(-1);margin-top:12px;"></video>`;
    return `
      <div class="card" id="eyeLive" style="margin-top:16px;padding:18px;">
        <div style="text-align:center;margin-bottom:8px;">
          <span aria-hidden="true" style="display:inline-block;width:16px;height:16px;border-radius:999px;background:var(--primary);animation:mgPulse 1.6s ease-in-out infinite;"></span>
          <div style="font-size:12.5px;color:var(--inkSoft);margin-top:4px;">tieni lo sguardo su questo punto, in alto, senza abbassarlo</div>
        </div>
        <div class="row-flex"><span class="badge alert">● registrazione in corso</span><span class="mono" id="eyeTime" style="font-weight:600;">0s / ${eyeTest.duration}s</span></div>
        <div style="height:6px;background:var(--line);border-radius:999px;margin-top:10px;"><div id="eyeBar" style="width:0%;height:100%;background:var(--primary);border-radius:999px;"></div></div>
        <div id="eyeStatus" style="font-size:11px;color:var(--inkSoft);margin-top:6px;text-align:center;">caricamento modello…</div>

        ${visual}

        <div id="eyeSpark" style="margin-top:10px;"></div>
        <div style="display:flex;justify-content:space-around;margin-top:12px;text-align:center;">
          <div><div class="mono" style="font-size:20px;font-weight:600;color:var(--primary);" id="eyeEAR">—</div><div style="font-size:11px;color:var(--inkSoft);">EAR (apertura)</div></div>
          <div><div class="mono" style="font-size:20px;font-weight:600;color:var(--warn);" id="eyePFH">—</div><div style="font-size:11px;color:var(--inkSoft);">rima palpebrale</div></div>
        </div>
        <button class="btn full" style="margin-top:16px;" onclick="eyeStop()">Termina ora</button>
      </div>`;
  }

  // ---- done ----
  const m=computeEyeBiomarkers();
  const r=eyeInterpretBio(m);

  if(!m.ok){
    return `
      <div class="card" style="margin-top:16px;padding:18px;">
        <div class="row-flex"><div style="font-weight:700;font-size:15px;">Risultato — fatigability oculare</div><span class="badge warn">Dato insufficiente</span></div>
        <div class="card" style="margin-top:12px;padding:12px;background:var(--warnSoft);border:none;font-size:13px;color:var(--warn);line-height:1.5;">${r.txt}</div>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button class="btn full" onclick="eyeReset()">Ripeti</button>
          <button class="btn full primary" onclick="testNav(1)">Continua</button>
        </div>
      </div>`;
  }

  const pColor=m.endPFH>0 && m.endPFH<6 ? 'var(--warn)':'var(--ink)';
  const dColor=m.declPFH>=20 ? 'var(--alert)':'var(--ink)';
  const tile=(val,label,color)=>`<div class="card" style="padding:10px;background:var(--bg);text-align:center;"><div class="mono" style="font-size:18px;font-weight:600;${color?`color:${color};`:''}">${val}</div><div style="font-size:11px;color:var(--inkSoft);">${label}</div></div>`;

  return `
    <div class="card" style="margin-top:16px;padding:18px;">
      <div class="row-flex"><div style="font-weight:700;font-size:15px;">Risultato — fatigability oculare</div><span class="badge ${r.tone}">${r.tone==='ok'?'Nella norma':r.tone==='warn'?'Da monitorare':'Alterato'}</span></div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;">
        ${tile(m.basePFH.toFixed(1)+' mm','rima iniziale')}
        ${tile(m.endPFH.toFixed(1)+' mm','rima finale',pColor)}
        ${tile('−'+Math.max(0,m.declPFH).toFixed(0)+'%','calo rima',dColor)}
        ${tile(m.endEAR.toFixed(2),'EAR finale')}
        ${tile(m.endMRD.toFixed(1)+' mm','MRD finale')}
        ${tile(m.blinks,'ammiccamenti')}
      </div>

      <div style="font-size:11px;color:var(--inkSoft);margin-top:8px;line-height:1.55;">
        EAR ${m.baseEAR.toFixed(2)} → ${m.endEAR.toFixed(2)} (−${Math.max(0,m.declEAR).toFixed(0)}%) · rima minima ${m.minPFH.toFixed(1)} mm · asimmetria EAR ${m.asym.toFixed(2)} · sguardo in alto ${(m.upFrac*100).toFixed(0)}% del tempo
      </div>

      ${m.earContour.length>1?`<div style="margin-top:12px;">${spark(m.earContour, m.earContour[0], C.primary, 50, 300)}</div><div style="font-size:11px;color:var(--inkSoft);margin-top:2px;">EAR nel tempo · tratteggio = livello di partenza (ammiccamenti esclusi)</div>`:''}

      <div class="card" style="margin-top:12px;padding:12px;background:var(--${r.tone}Soft);border:none;font-size:13px;color:var(--${r.tone==='ok'?'ok':r.tone});line-height:1.5;">${r.txt}</div>

      <div style="font-size:11px;color:var(--inkSoft);margin-top:8px;line-height:1.5;">
        Elaborazione on-device con MediaPipe Face Landmarker: nessuna immagine lascia il dispositivo, solo i parametri estratti. Rima e MRD in mm calibrati sul diametro dell'iride (≈ 11,7 mm); per i valori clinici esatti vale comunque la visita.
      </div>

      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="btn full" onclick="eyeReset()">Ripeti</button>
        <button class="btn full primary" onclick="testNav(1)">Continua</button>
      </div>
    </div>`;
}
