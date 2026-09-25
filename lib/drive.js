const SUPA = 'https://ixclkelqjpfkucejbzuq.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4Y2xrZWxxanBma3VjZWpienVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzM5NTAsImV4cCI6MjA5NjA0OTk1MH0.VmXA6P-9IS0TsNnh_2ZGBQZQqtqtCrp4CdHGOVIc5zU';
const SECRET = process.env.SP_SYNC_SECRET;
const CLIENT_ID = '19788603553-01os3u2f30a6infut0slflqfdknc546m.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FOLDER_ID = '1M4uhyUFKK8FqIhr-S0XVeYQ8n1n6TgVI';
const REDIRECT_URI = 'https://formulario.studiopulga.com.br/oauth/callback';
const ADMIN_SENHA = 'Studio2801';

async function rpc(name, args) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ p_secret: SECRET }, args))
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${name} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

async function accessToken() {
  const rt = await rpc('sp_cfg_get', { p_chave: 'drive_refresh_token' });
  if (!rt) throw new Error('DRIVE_NAO_CONECTADO');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: rt, grant_type: 'refresh_token' })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Falha ao renovar acesso ao Drive: ' + JSON.stringify(j));
  return j.access_token;
}

async function driveUpload(token, meta, blob) {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  fd.append('file', blob);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Drive upload ${r.status} ${t}`);
  return JSON.parse(t).id;
}

async function criarPasta(token, nome) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [FOLDER_ID] })
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Drive pasta ${r.status} ${t}`);
  return JSON.parse(t).id;
}

function dataBR(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '_');
}

async function syncEnvio(id) {
  const rows = await rpc('sp_envio_get', { p_id: id });
  const row = rows && rows[0];
  if (!row) throw new Error('Envio nao encontrado');
  if (row.drive_status === 'ok') return { ok: true, jaEnviado: true };
  try {
    const token = await accessToken();
    const empresa = (row.empresa || 'Cliente').trim();
    const pasta = row.drive_folder_id || await criarPasta(token, `${empresa} ~ ${dataBR(row.criado_em)}`);
    await rpc('sp_envio_status', { p_id: id, p_status: 'enviando', p_folder: pasta, p_erro: null });
    await driveUpload(token, { name: `Onboarding ~ ${empresa}.html`, parents: [pasta], mimeType: 'text/html' },
      new Blob([row.doc_html || ''], { type: 'text/html;charset=utf-8' }));
    const imgs = row.imagens || [];
    for (let i = 0; i < imgs.length; i++) {
      const im = imgs[i];
      const ri = await fetch(`${SUPA}/storage/v1/object/public/onboarding/${im.path}`);
      if (!ri.ok) throw new Error(`Imagem ${i + 1} indisponivel no armazenamento (${ri.status})`);
      const buf = await ri.arrayBuffer();
      await driveUpload(token, { name: `Insights ${i + 1} ~ ${im.nome}`, parents: [pasta] }, new Blob([buf], { type: im.tipo }));
    }
    await rpc('sp_envio_status', { p_id: id, p_status: 'ok', p_folder: pasta, p_erro: null });
    return { ok: true, pasta, imagens: imgs.length };
  } catch (e) {
    const msg = String(e.message || e);
    await rpc('sp_envio_status', { p_id: id, p_status: msg.includes('DRIVE_NAO_CONECTADO') ? 'aguardando_drive' : 'erro', p_folder: null, p_erro: msg.slice(0, 900) }).catch(() => {});
    return { ok: false, erro: msg };
  }
}

module.exports = { SUPA, ANON, SECRET, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, ADMIN_SENHA, rpc, syncEnvio, accessToken };
