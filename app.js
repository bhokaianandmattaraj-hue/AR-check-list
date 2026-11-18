const $=id=>document.getElementById(id);const C=window.ARBOX_CONFIG||{};
const cloudReady=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
const db=cloudReady?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
let catalog=[],state={},session=null,filter='All',radar=[],customModels=[];
const PHOTO_BUCKET='arbox-photo-contributions';
let photoOverrides={},photoPending=new Set(),photoAdmin=false,selectedPhotoModel=null,chosenPhotoBlob=null,previewObjectUrl=null;

const guestKey='arbox-garage-guest-v2';
function getLocal(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}}
function userKey(){return session?'arbox-garage-user-'+session.user.id:guestKey}
function saveLocal(){localStorage.setItem(userKey(),JSON.stringify(state))}
function switchState(){state=getLocal(userKey());render()}
function allModels(){return [...catalog,...customModels].filter(eligible)}

state=getLocal(guestKey);
const statuses=['Owned','Ordered','Missing','Unconfirmed','Wishlist'];
const allowedBrands=['ARBOX','PGM','Tarmac Works','INNO64'];
const editionTypes=['Regular','Chase','Event Exclusive','Limited Edition'];
function maker(m){return m.manufacturer||(m.brand==='Porsche'||m.brand==='Land Rover'?'ARBOX':m.brand)}
function eligible(m){return allowedBrands.includes(maker(m))}
function edition(m){return m.editionType||(m.variant==='Chase'?'Chase':'Regular')}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function actual(m){return state[m.id]||'Missing'}
function render(){
 const q=$('search').value.toLowerCase();
 const all=allModels();
 const items=all.filter(m=>(filter==='All'||maker(m)===filter||(filter==='Chase'&&edition(m)==='Chase')||(filter==='Event'&&edition(m)==='Event Exclusive')||(filter==='Limited'&&edition(m)==='Limited Edition')||(filter==='Upcoming'&&['TBA','Preorder','Announced','Upcoming'].includes(m.release)))&&(`${m.number} ${m.name} ${m.brand} ${maker(m)} ${edition(m)}`.toLowerCase().includes(q)));
 $('owned').textContent=all.filter(m=>actual(m)==='Owned').length;
 $('ordered').textContent=all.filter(m=>actual(m)==='Ordered').length;
 $('missing').textContent=all.filter(m=>actual(m)==='Missing').length;
 $('count').textContent=`${items.length} models`;
 $('models').innerHTML=items.map(m=>{
  const approved=photoOverrides[m.id];
  const imageUrl=approved||m.photo;
  const isPending=photoPending.has(m.id);
  const photoButton=isPending?'<button class="photo-action" disabled>Photo awaiting review</button>':`<button class="photo-action" type="button" data-photo-model="${esc(m.id)}">${imageUrl?'📷 Suggest replacement photo':'📷 Contribute a photo'}</button>`;
  const photoMarkup=imageUrl?`<a class="photo-link" href="${esc(approved||m.photoSource||m.photo)}" target="_blank" rel="noopener noreferrer" aria-label="Photo or source for ${esc(m.name)}"><img loading="lazy" src="${esc(imageUrl)}" alt="${approved?'Approved collector photo':'Product listing photo'}: ${esc(m.name)}" onerror="this.hidden=true;this.parentElement.nextElementSibling.hidden=false"></a><span class="photo-pending" hidden>Photo unavailable${m.photoSource?`<a class="source-link" href="${esc(m.photoSource)}" target="_blank" rel="noopener noreferrer">View product listing ↗</a>`:''}</span>`:`<span class="photo-pending">Exact product photo pending${m.photoSource?`<a class="source-link" href="${esc(m.photoSource)}" target="_blank" rel="noopener noreferrer">View product listing ↗</a>`:''}</span>`;
  return `<article class="model"><div class="photo">${photoMarkup}<span class="number">${m.number?`#${esc(m.number)}`:'SKU pending'}</span>${edition(m)==='Chase'?'<span class="variant">✦ CHASE</span>':edition(m)==='Event Exclusive'?'<span class="variant">EVENT</span>':edition(m)==='Limited Edition'?'<span class="variant">LIMITED</span>':''}</div><div class="info"><div class="muted">${esc(maker(m))} · ${esc(m.brand)}</div><div class="name">${esc(m.name)}</div><div class="sub"><span class="pill ${esc(String(m.release).toLowerCase())}">${esc(m.release)}</span></div>${photoButton}<select aria-label="Collection status for ${esc(m.name)}" data-id="${esc(m.id)}">${statuses.map(s=>`<option ${actual(m)===s?'selected':''}>${s}</option>`).join('')}</select></div></article>`;
 }).join('')||'<p>No matching models.</p>';
 document.querySelectorAll('select[data-id]').forEach(sel=>sel.addEventListener('change',()=>saveStatus(sel.dataset.id,sel.value)));
 document.querySelectorAll('button[data-photo-model]').forEach(btn=>btn.addEventListener('click',()=>openPhotoDialog(btn.dataset.photoModel)));
}
async function saveStatus(id,status){state[id]=status;saveLocal();render();if(db&&session){let {error}=await db.from('collection').upsert({user_id:session.user.id,model_id:id,status},{onConflict:'user_id,model_id'});if(error)alert('Saved on this phone but cloud sync failed: '+error.message)}}
function authUI(message=''){let area=$('authArea');if(!cloudReady){area.innerHTML='<b>Local preview mode</b><p>Collection changes are saved on this device. To enable private cloud sync, fill in config.js and run schema.sql in Supabase.</p>';return}if(session){area.innerHTML=`<b>☁ Cloud sync enabled</b><div class="muted">Signed in: ${esc(session.user.email||'collector')}</div><div class="auth"><button id="signOut" class="outline">Sign out</button></div>${message?`<p>${esc(message)}</p>`:''}`;$('signOut').onclick=async()=>{await db.auth.signOut();session=null;customModels=[];switchState();authUI();};return}area.innerHTML=`<b>Sign in for cloud sync</b><p class="muted">Enter your email for a secure sign-in link.</p><div class="auth"><input id="email" type="email" placeholder="you@example.com"><button id="login" class="primary">Send sign-in link</button></div>${message?`<p>${esc(message)}</p>`:''}`;$('login').onclick=async()=>{let email=$('email').value.trim();if(!email)return;let {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});authUI(error?error.message:'Check your email and open the sign-in link.')};}
async function loadCloud(){
 if(!db||!session)return;
 const [collections,extras]=await Promise.all([
   db.from('collection').select('model_id,status').eq('user_id',session.user.id),
   db.from('custom_models').select('id,brand,number,name,variant,release,photo,photo_source').eq('user_id',session.user.id)
 ]);
 if(collections.error){authUI(collections.error.message);return}
 if(extras.error){authUI('Collection loaded, but custom models are unavailable. Run the v2 SQL migration.');customModels=[]}
 else customModels=(extras.data||[]).filter(x=>allowedBrands.includes(x.brand)).map(x=>({id:x.id,manufacturer:x.brand,brand:x.brand,number:x.number,name:x.name,variant:x.variant,editionType:x.variant,release:x.release,photo:x.photo,photoSource:x.photo_source,custom:true}));
 state=getLocal(userKey());
 for(const row of collections.data||[])state[row.model_id]=row.status;
 saveLocal();render();authUI('Your private garage is loaded.');
}
async function sync(){if(!db){authUI();return}const {data}=await db.auth.getSession();session=data.session;customModels=[];switchState();authUI();if(session)await loadCloud();await loadRadar();}
function radarRender(){const el=$('feed');el.innerHTML=radar.length?radar.map(x=>`<div class="feeditem"><strong>${esc(x.title)}</strong><div class="muted">${esc(x.brand)} · ${esc(x.status||'TBA / review')} · ${esc((x.detected_at||'').slice(0,10))}</div><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">View source ↗</a></div>`).join(''):'<div class="notice">No release leads have been collected yet. Enable the scheduled checker in GitHub Actions, then refresh.</div>'}
async function loadRadar(){if(!db){radarRender();return}let {data,error}=await db.from('release_leads').select('title,brand,url,status,detected_at').order('detected_at',{ascending:false}).limit(40);if(error){$('feed').innerHTML='<div class="notice">Release feed unavailable: '+esc(error.message)+'</div>';return}radar=(data||[]).filter(x=>allowedBrands.some(b=>b.toLowerCase()===String(x.brand||'').toLowerCase()));radarRender()}
function csv(){const rows=[['Number','Diecast Brand','Vehicle Make','Model','Edition','Release','Collection'],...allModels().map(m=>[m.number,maker(m),m.vehicleMake||m.brand,m.name,edition(m),m.release,actual(m)])];const s=rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([s],{type:'text/csv'}));a.download='arbox-garage.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function b64ToUint8(s){const p='='.repeat((4-s.length%4)%4);const raw=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function enablePush(){const status=$('pushStatus');if(!db||!session){status.textContent='Sign in to cloud sync first.';return}if(!C.vapidPublicKey){status.textContent='Add your VAPID public key to config.js first.';return}if(!('serviceWorker'in navigator)||!('PushManager'in window)){status.textContent='Push is not available in this browser. Open the installed Home Screen app.';return}try{const perm=await Notification.requestPermission();if(perm!=='granted'){status.textContent='Notifications not allowed.';return}let reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToUint8(C.vapidPublicKey)});const {error}=await db.from('push_subscriptions').upsert({user_id:session.user.id,endpoint:sub.endpoint,subscription:sub.toJSON()},{onConflict:'user_id,endpoint'});if(error)throw error;status.textContent='Push subscription saved. Alerts will arrive when the scheduled checker finds a new lead.'}catch(e){status.textContent='Could not enable push: '+e.message}}
function photoMessage(message){$('photoMessage').textContent=message}
function clearPhotoPreview(){
 chosenPhotoBlob=null;
 if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null}
 $('photoPreview').hidden=true;$('photoPreview').removeAttribute('src');
 $('photoCameraInput').value='';$('photoGalleryInput').value='';
}
function openPhotoDialog(modelId){
 if(!session||!db){authUI('Sign in before contributing photographs.');$('authArea').scrollIntoView({behavior:'smooth',block:'start'});return}
 const model=allModels().find(x=>x.id===modelId);
 if(!model){return}
 if(photoPending.has(modelId)){return}
 selectedPhotoModel=model;
 clearPhotoPreview();photoMessage('');$('photoConsent').checked=false;$('photoNote').value='';
 $('photoModelDescription').textContent=`${maker(model)} · ${model.name} ${model.number?'(#'+model.number+')':''}`;
 $('photoDialog').showModal();
}
function closePhotoDialog(){$('photoDialog').close();selectedPhotoModel=null;clearPhotoPreview();}
function choosePhoto(file){
 if(!file)return;
 if(!file.type.startsWith('image/')){photoMessage('Select an image file.');return}
 if(file.size>25000000){photoMessage('That image is too large. Please select one under 25 MB.');return}
 photoMessage('Preparing your image…');
 const temp=URL.createObjectURL(file);const img=new Image();
 img.onload=()=>{
  try{
   const scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d',{alpha:false});
   if(!ctx)throw Error('Image conversion is not available.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   canvas.toBlob(blob=>{
    URL.revokeObjectURL(temp);
    if(!blob){photoMessage('Could not prepare this image. Try JPG or PNG.');return}
    if(blob.size>5*1024*1024){photoMessage('Compressed photo is still too large (5 MB maximum).');return}
    clearPhotoPreview();chosenPhotoBlob=blob;
    previewObjectUrl=URL.createObjectURL(blob);
    $('photoPreview').src=previewObjectUrl;$('photoPreview').hidden=false;
    photoMessage('Photo ready. Please confirm permission before submitting.');
   },'image/jpeg',.82);
  }catch(e){URL.revokeObjectURL(temp);photoMessage(e.message)}
 };
 img.onerror=()=>{URL.revokeObjectURL(temp);photoMessage('Could not open this file. Use JPG, PNG, or a supported phone photo format.')};
 img.src=temp;
}
async function submitPhotoContribution(){
 const model=selectedPhotoModel;
 if(!model||!session||!db){photoMessage('Please sign in first.');return}
 if(!chosenPhotoBlob){photoMessage('Choose or take a photograph first.');return}
 if(!$('photoConsent').checked){photoMessage('Confirm you own the image or have permission to submit it.');return}
 const submit=$('photoSend');submit.disabled=true;
 let storagePath=null,createdId=null;
 try{
  photoMessage('Creating a private submission…');
  storagePath=`${session.user.id}/${crypto.randomUUID()}.jpg`;
  const note=$('photoNote').value.trim().slice(0,500);
  const {data:created,error:saveError}=await db.from('model_photo_contributions').insert({model_id:model.id,user_id:session.user.id,storage_path:storagePath,note}).select('id').single();
  if(saveError)throw saveError;
  createdId=created.id;
  photoMessage('Uploading your photograph securely…');
  const {error:uploadError}=await db.storage.from(PHOTO_BUCKET).upload(storagePath,chosenPhotoBlob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
  if(uploadError)throw uploadError;
  photoPending.add(model.id);render();closePhotoDialog();
  $('photoGeneralStatus').textContent='Photo submitted for review. It will not appear publicly until approved.';
 }catch(e){
  photoMessage('Submission failed: '+e.message);
  if(createdId){
   await db.from('model_photo_contributions').delete().eq('id',createdId).eq('status','pending');
   if(storagePath)await db.storage.from(PHOTO_BUCKET).remove([storagePath]);
  }
 }finally{submit.disabled=false}
}
async function loadPhotoContributions(){
 if(!db){return}
 const {data:published,error:publishedError}=await db.from('model_photo_contributions').select('model_id,storage_path').eq('status','approved');
 if(publishedError){$('photoGeneralStatus').textContent='Photo service not ready: '+publishedError.message;return}
 const rows=(published||[]).filter(x=>catalog.some(m=>m.id===x.model_id));
 const nextOverrides={};
 if(rows.length){
  const {data:signed,error:signError}=await db.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map(x=>x.storage_path),6*60*60);
  if(signError){$('photoGeneralStatus').textContent='Some approved photos could not be loaded: '+signError.message}
  else (signed||[]).forEach((x,i)=>{if(x&&x.signedUrl&&!x.error)nextOverrides[rows[i].model_id]=x.signedUrl});
 }
 photoOverrides=nextOverrides;
 if(session){
  const {data:mine,error:mineError}=await db.from('model_photo_contributions').select('model_id').eq('user_id',session.user.id).eq('status','pending');
  if(!mineError)photoPending=new Set((mine||[]).map(x=>x.model_id));
 }else photoPending=new Set();
 render();
 if(session)await checkPhotoAdmin();
 else{$('photoAdminPanel').hidden=true;photoAdmin=false}
}
async function checkPhotoAdmin(){
 const {data,error}=await db.rpc('is_arbox_photo_admin');
 photoAdmin=!error&&data===true;
 $('photoAdminPanel').hidden=!photoAdmin;
 if(photoAdmin)await loadPhotoAdminQueue();
}
async function loadPhotoAdminQueue(){
 if(!photoAdmin||!session)return;
 const area=$('photoAdminQueue');area.textContent='Loading pending photos…';
 const {data,error}=await db.from('model_photo_contributions').select('id,model_id,storage_path,note,submitted_at').eq('status','pending').order('submitted_at',{ascending:true}).limit(30);
 if(error){area.textContent='Review queue unavailable: '+error.message;return}
 if(!data?.length){area.innerHTML='<p class="muted">No pending photographs.</p>';return}
 const cards=await Promise.all(data.map(async rec=>{
  const model=allModels().find(m=>m.id===rec.model_id);
  const {data:link}=await db.storage.from(PHOTO_BUCKET).createSignedUrl(rec.storage_path,3600);
  return `<article class="photo-review"><strong>${esc(model?maker(model)+' · '+model.name:rec.model_id+' (not in current catalogue)')}</strong><p class="muted">${esc(rec.note||'No notes provided')}</p>${link?.signedUrl?`<img loading="lazy" src="${esc(link.signedUrl)}" alt="Submitted photograph awaiting approval">`:'<p>Photo preview unavailable</p>'}<div class="review-actions"><button type="button" data-review-id="${esc(rec.id)}" data-review-state="approved" class="primary">Approve photo</button><button type="button" data-review-id="${esc(rec.id)}" data-review-state="rejected">Reject</button></div></article>`;
 }));
 area.innerHTML=cards.join('');
 area.querySelectorAll('button[data-review-id]').forEach(button=>button.addEventListener('click',async()=>{
  const id=button.dataset.reviewId,status=button.dataset.reviewState;
  if(!confirm(status==='approved'?'Publish this photograph for all collectors?':'Reject this photo submission?'))return;
  button.disabled=true;
  const {error:updateError}=await db.rpc('review_arbox_photo',{p_id:id,p_status:status});
  if(updateError){$('photoAdminMessage').textContent='Could not review submission: '+updateError.message;button.disabled=false;return}
  $('photoAdminMessage').textContent='Photo '+status+'.';
  await loadPhotoContributions();
 }));
}
async function start(){
 catalog=(await (await fetch('catalog.json')).json()).filter(eligible);
 render();
 $('search').oninput=render;
 document.querySelectorAll('#filters button').forEach(b=>b.onclick=()=>{
  filter=b.dataset.filter;
  document.querySelectorAll('#filters button').forEach(x=>x.classList.toggle('active',x===b));
  render();
 });
 $('syncBtn').onclick=async()=>{await sync();await loadPhotoContributions()};
 $('refresh').onclick=loadRadar;
 $('export').onclick=csv;
 $('push').onclick=enablePush;
 $('photoCamera').onclick=()=>$('photoCameraInput').click();
 $('photoGallery').onclick=()=>$('photoGalleryInput').click();
 $('photoCameraInput').onchange=e=>choosePhoto(e.target.files?.[0]);
 $('photoGalleryInput').onchange=e=>choosePhoto(e.target.files?.[0]);
 $('photoClose').onclick=closePhotoDialog;
 $('photoSend').onclick=submitPhotoContribution;
 $('photoRefresh').onclick=loadPhotoAdminQueue;
 $('photoDialog').addEventListener('close',()=>{selectedPhotoModel=null;clearPhotoPreview()});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
 if(db){
  db.auth.onAuthStateChange((_event,s)=>{
   const old=session?.user?.id;session=s;
   if(old!==s?.user?.id){customModels=[];photoPending=new Set();switchState()}
   authUI();
   if(s)setTimeout(async()=>{await loadCloud();await loadPhotoContributions()},0);
   else {$('photoAdminPanel').hidden=true;photoAdmin=false;loadPhotoContributions()}
  });
 }
 await sync();await loadPhotoContributions();
}
start().catch(e=>{$('authArea').textContent='Could not load app: '+e.message});
