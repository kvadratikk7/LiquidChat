/* LiquidChat frontend. Never put the Supabase service-role key in this file. */
const SUPABASE_URL = "https://lhmpyloxmvphykjoftxn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KcO7qy9PvEM0xr7Aehv-Tw_hasPbMHq";
const configured = !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = id => document.getElementById(id);
let authMode = "login", user = null, profile = null, activeChat = null, activePeer = null, messageChannel = null, chats = [], createKind = "group";

function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600)}
function notice(id,s){$(id).textContent=s}
function escapeHTML(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function isEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function normalizePhone(v){return v.replace(/[^\d+]/g,"")}
function setAuthMode(mode){authMode=mode;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));$("nameLabel").classList.toggle("hidden",mode!=="register");$("usernameLabel").classList.toggle("hidden",mode!=="register");$("authSubmit").textContent=mode==="login"?"Получить код":"Создать аккаунт";notice("authMessage","")}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.auth)));

$("authForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!sb){notice("authMessage","Сначала укажи SUPABASE_URL и SUPABASE_ANON_KEY в app.js.");return}
 const id=$("identifier").value.trim(), phone=!isEmail(id), value=phone?normalizePhone(id):id;
 if(phone&&!/^\+[1-9]\d{7,14}$/.test(value)){notice("authMessage","Укажи номер в международном формате, например +77001234567.");return}
 try{
  if(authMode==="register"){
   const username=$("newUsername").value.trim().toLowerCase().replace(/^@/,"");
   if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error("Username: 3–24 символа, латиница, цифры и _.");
   const {data:exists,error:exErr}=await sb.from("profiles").select("id").eq("username",username).maybeSingle();if(exErr)throw exErr;if(exists)throw Error("Этот username уже занят.");
   const opts={data:{display_name:$("displayName").value.trim(),username}};
   const res=phone?await sb.auth.signInWithOtp({phone:value,options:{...opts, shouldCreateUser:true}}):await sb.auth.signUp({email:value,password:temporaryPassword(),options:opts});
   if(res.error)throw res.error;
   if(phone){notice("authMessage","SMS-код отправлен.");showOtp(value,true);}
   else notice("authMessage","Письмо подтверждения отправлено. Подтверди почту, затем войди.");
  }else{
   if(phone){const {error}=await sb.auth.signInWithOtp({phone:value});if(error)throw error;notice("authMessage","SMS-код отправлен. Введи его ниже.");}
   else{const {error}=await sb.auth.signInWithOtp({email:value});if(error)throw error;notice("authMessage","Код входа отправлен на почту.");}
   showOtp(value,phone);
  }
 }catch(err){notice("authMessage",err.message||"Не удалось выполнить запрос.")}
});
function temporaryPassword(){return "LC-"+crypto.randomUUID()+"-Aa9!"}
function showOtp(identifier,phone){
 let old=$("otpBox");if(old)old.remove();const box=document.createElement("div");box.id="otpBox";box.innerHTML='<label>Код подтверждения<input id="otpCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456"></label><button class="primary" id="verifyOtp">Подтвердить код</button>'; $("authForm").append(box);
 $("verifyOtp").onclick=async()=>{try{const token=$("otpCode").value.trim();const result=phone?await sb.auth.verifyOtp({phone:identifier,token,type:"sms"}):await sb.auth.verifyOtp({email:identifier,token,type:"email"});if(result.error)throw result.error;await loadApp()}catch(e){notice("authMessage",e.message)}};
}
async function init(){if(!configured){$("authView").classList.remove("hidden");notice("authMessage","Настрой Supabase в app.js, чтобы включить приложение.");return}
 const {data:{session}}=await sb.auth.getSession();if(session)await loadApp();
 sb.auth.onAuthStateChange((_event,session)=>{if(session&&!user)setTimeout(loadApp,0);else if(!session){user=null;$("appView").classList.add("hidden");$("authView").classList.remove("hidden")}});
}
async function loadApp(){
 const {data:{user:u}}=await sb.auth.getUser();if(!u)return;user=u;
 let {data:p,error}=await sb.from("profiles").select("*").eq("id",u.id).maybeSingle();if(error)throw error;
 if(!p){const meta=u.user_metadata||{};const uname=(meta.username||("user_"+u.id.slice(0,8))).toLowerCase();const made=await sb.from("profiles").insert({id:u.id,username:uname,display_name:meta.display_name||"Новый пользователь"}).select().single();if(made.error)throw made.error;p=made.data}
 profile=p;$("authView").classList.add("hidden");$("appView").classList.remove("hidden");$("myHandle").textContent="@"+p.username;renderProfile();await loadChats();
}
function renderProfile(){$("editName").value=profile.display_name||"";$("editUsername").value=profile.username||"";$("editBio").value=profile.bio||"";$("avatarFallback").textContent=(profile.display_name||"LC").slice(0,2).toUpperCase();if(profile.avatar_url){$("avatarPreview").src=profile.avatar_url;$("avatarPreview").style.display="block";$("avatarFallback").style.display="none"}else{$("avatarPreview").style.display="none";$("avatarFallback").style.display="block"}}
$("profileBtn").onclick=()=>{if(!user)return;renderProfile();$("profileDialog").showModal()};
$("logoutBtn").onclick=async()=>{await sb.auth.signOut();$("profileDialog").close();toast("Вы вышли из аккаунта")};
$("themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("lc-theme",document.body.classList.contains("dark")?"dark":"light")};
if(localStorage.getItem("lc-theme")==="dark")document.body.classList.add("dark");
async function uploadAvatar(file){if(!file)return null;if(file.size>5*1024*1024)throw Error("Максимальный размер фото — 5 МБ.");if(!file.type.startsWith("image/"))throw Error("Выбери изображение.");const path=`${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error}=await sb.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type});if(error)throw error;return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl}
$("avatarFile").onchange=async e=>{try{const url=await uploadAvatar(e.target.files[0]);if(url){profile.avatar_url=url;$("avatarPreview").src=url;$("avatarPreview").style.display="block";$("avatarFallback").style.display="none"}}catch(err){notice("profileMessage",err.message)}};
$("cameraBtn").onclick=()=>$("cameraFile").click();
$("cameraFile").onchange=$("avatarFile").onchange;
$("saveProfile").onclick=async()=>{try{const username=$("editUsername").value.trim().toLowerCase().replace(/^@/,"");if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error("Username: 3–24 символа, латиница, цифры и _.");const {data:dup,error:de}=await sb.from("profiles").select("id").eq("username",username).neq("id",user.id).maybeSingle();if(de)throw de;if(dup)throw Error("Username уже занят.");const patch={display_name:$("editName").value.trim(),username,bio:$("editBio").value.trim(),avatar_url:profile.avatar_url};const {data,error}=await sb.from("profiles").update(patch).eq("id",user.id).select().single();if(error)throw error;profile=data;$("myHandle").textContent="@"+data.username;$("profileDialog").close();toast("Профиль сохранён")}catch(e){notice("profileMessage",e.message)}};

async function loadChats(){const {data,error}=await sb.from("chat_members").select("chat_id,chats(id,title,type,created_at)").eq("user_id",user.id);if(error){console.error(error);return}chats=(data||[]).map(x=>x.chats).filter(Boolean);renderChats()}
function renderChats(){const q=$("searchInput").value.toLowerCase();$("chatList").innerHTML="";const filtered=chats.filter(c=>(c.title||"").toLowerCase().includes(q));if(!filtered.length){$("chatList").innerHTML='<div class="empty">Чаты не найдены</div>';return}filtered.forEach(c=>{const el=document.createElement("div");el.className="chat-item";el.innerHTML=`<div class="avatar">${c.type==="channel"?"▤":(c.title||"LC").slice(0,2).toUpperCase()}</div><div class="chat-meta"><b>${escapeHTML(c.title)}</b><small>${escapeHTML(c.type==="channel"?"Канал":c.type==="group"?"Группа":"Личный чат")}</small></div>`;el.onclick=()=>openChat(c);$("chatList").append(el)})}
$("searchInput").oninput=renderChats;
async function openChat(chat){activeChat=chat;activePeer=null;$("welcome").classList.add("hidden");$("chatPanel").classList.remove("hidden");$("peerName").textContent=chat.title;$("peerStatus").textContent=chat.type==="channel"?"Канал":chat.type==="group"?"Группа":"Личный чат";$("peerVerified").classList.add("hidden");await loadMessages();if(messageChannel)sb.removeChannel(messageChannel);messageChannel=sb.channel("messages-"+chat.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"chat_id=eq."+chat.id},payload=>renderMessage(payload.new)).subscribe()}
async function loadMessages(){const {data,error}=await sb.from("messages").select("id,chat_id,sender_id,content,created_at").eq("chat_id",activeChat.id).order("created_at",{ascending:true}).limit(200);if(error){toast(error.message);return}$("messages").innerHTML="";(data||[]).forEach(renderMessage)}
function renderMessage(m){if(!activeChat||m.chat_id!==activeChat.id)return;const el=document.createElement("div");el.className="bubble"+(m.sender_id===user.id?" mine":"");const time=new Date(m.created_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});el.innerHTML=`${escapeHTML(m.content)}<time>${time}</time>`;$("messages").append(el);$("messages").scrollTop=$("messages").scrollHeight}
$("messageForm").onsubmit=async e=>{e.preventDefault();const content=$("messageInput").value.trim();if(!content||!activeChat)return;const {error}=await sb.from("messages").insert({chat_id:activeChat.id,sender_id:user.id,content});if(error){toast(error.message);return}$("messageInput").value=""};
async function findOrCreateDM(peer){const {data:mine}=await sb.from("chat_members").select("chat_id,chats(id,title,type)").eq("user_id",user.id);for(const m of mine||[]){if(m.chats?.type!=="dm")continue;const {data:members}=await sb.from("chat_members").select("user_id").eq("chat_id",m.chat_id);if(members?.length===2&&members.some(x=>x.user_id===peer.id))return m.chats}
 const {data:chat,error}=await sb.from("chats").insert({title:peer.display_name,type:"dm",created_by:user.id}).select().single();if(error)throw error;const {error:me}=await sb.from("chat_members").insert([{chat_id:chat.id,user_id:user.id,role:"member"},{chat_id:chat.id,user_id:peer.id,role:"member"}]);if(me)throw me;chats.unshift(chat);renderChats();return chat}
$("newChatBtn").onclick=()=>{$("searchDialog").showModal();$("peopleSearch").focus()};
let searchTimer; $("peopleSearch").oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchPeople,250)};
async function searchPeople(){const q=$("peopleSearch").value.trim().replace(/^@/,"");if(q.length<2){$("peopleResults").innerHTML="";return}const {data,error}=await sb.from("profiles").select("id,username,display_name,avatar_url,is_verified").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).neq("id",user.id).limit(20);if(error){$("peopleResults").textContent=error.message;return}$("peopleResults").innerHTML="";(data||[]).forEach(p=>{const el=document.createElement("div");el.className="person-item";el.innerHTML=`<div class="avatar">${escapeHTML((p.display_name||"LC").slice(0,2).toUpperCase())}</div><div class="chat-meta"><b>${escapeHTML(p.display_name)} ${p.is_verified?"✓":""}</b><small>@${escapeHTML(p.username)}</small></div>`;el.onclick=async()=>{try{const c=await findOrCreateDM(p);$("searchDialog").close();await loadChats();openChat(c)}catch(e){toast(e.message)}};$("peopleResults").append(el)})}
function openCreate(kind){createKind=kind;$("createTitle").textContent=kind==="group"?"Новая группа":"Новый канал";$("createName").value="";$("createUsername").value="";notice("createMessage","");$("createDialog").showModal()}
$("createGroupBtn").onclick=()=>openCreate("group");$("createChannelBtn").onclick=()=>openCreate("channel");
$("createSubmit").onclick=async()=>{try{const title=$("createName").value.trim();if(title.length<2)throw Error("Название должно содержать минимум 2 символа.");const {data:chat,error}=await sb.from("chats").insert({title,type:createKind,created_by:user.id,username:$("createUsername").value.trim().toLowerCase().replace(/^@/,"")||null}).select().single();if(error)throw error;const {error:memberError}=await sb.from("chat_members").insert({chat_id:chat.id,user_id:user.id,role:"owner"});if(memberError)throw memberError;chats.unshift(chat);renderChats();$("createDialog").close();openChat(chat);toast(createKind==="group"?"Группа создана":"Канал создан")}catch(e){notice("createMessage",e.message)}};

async function sendAdminCommand(targetUsername,command){const {data:{session}}=await sb.auth.getSession();const {data,error}=await sb.functions.invoke("admin-command",{body:{target_username:targetUsername,command},headers:{Authorization:`Bearer ${session.access_token}`}});if(error)throw error;return data}
$("messageForm").addEventListener("submit",async e=>{ /* command handler is intentionally separate from normal messages */ });
async function maybeAdminCommand(content){if(!profile||profile.username!=="owner"||!/^\/(verified|ban)\s+@?[a-z0-9_]{3,24}$/i.test(content))return false;const [,cmd,name]=content.match(/^\/(verified|ban)\s+@?([a-z0-9_]{3,24})$/i);try{const result=await sendAdminCommand(name,cmd.toLowerCase());toast(result.message||"Готово");return true}catch(e){toast(e.message||"Ошибка команды");return true}}
const originalSubmit=$("messageForm").onsubmit;
$("messageForm").onsubmit=async e=>{e.preventDefault();const content=$("messageInput").value.trim();if(!content||!activeChat)return;if(await maybeAdminCommand(content)){$("messageInput").value="";return}const {error}=await sb.from("messages").insert({chat_id:activeChat.id,sender_id:user.id,content});if(error){toast(error.message);return}$("messageInput").value=""};
init().catch(e=>{console.error(e);notice("authMessage",e.message||"Ошибка запуска")});
