userTable=function(rows){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Contact</th><th>Product role</th><th>Ops role</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.name||'—')}</strong><br><small>${esc(r.city||'')}</small></td><td>${esc(r.email||'—')}<br><small>${esc(r.phone||'')}</small></td><td>${badge(r.role)}</td><td>${r.ops_role?badge(r.ops_role):'—'}</td><td>${badge(r.status||'active')}</td><td>${state.me?.ops_role==='admin'&&r.role!=='admin'?`<button class="ghost" data-set-ops-role="${esc(r.id)}" data-current-ops-role="${esc(r.ops_role||'')}">${r.ops_role?'Change Ops role':'Add to team'}</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
};

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-set-ops-role]');
  if(!button||state.me?.ops_role!=='admin')return;
  const current=button.dataset.currentOpsRole||'none';
  const value=prompt(`Current Operations role: ${current}\nSet role to cs, manager, admin, or leave blank to remove:`);
  if(value===null)return;
  const next=value.trim().toLowerCase();
  if(next&&!['cs','manager','admin'].includes(next))return toast('Role must be cs, manager or admin');
  const reason=prompt('Reason for this Operations role change:');
  if(!reason?.trim())return;
  try{
    await api('/ops/staff/'+encodeURIComponent(button.dataset.setOpsRole)+'/role',{method:'PATCH',body:JSON.stringify({ops_role:next||null,reason:reason.trim()})});
    toast(next?'Operations role updated':'Operations access removed');
    await users();
  }catch(error){toast(error.message)}
});
