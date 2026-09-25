const crypto = require('crypto');
const { rpc, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, ADMIN_SENHA, SECRET, syncEnvio } = require('../lib/drive');
const page = (t, m) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title></head>
<body style="font-family:Arial,sans-serif;background:#F4EADD;color:#6E2C14;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div><h1 style="letter-spacing:.04em">STUDIO PULGA</h1><p style="font-size:18px">${m}</p><p><a style="color:#6E2C14" href="/admin">Ir para o painel</a></p></div></body></html>`;
module.exports = async (req, res) => {
  const q = req.query || {};
  const state = crypto.createHash('sha256').update('sp-drive-' + SECRET).digest('hex').slice(0, 32);
  if (q.code) {
    if (q.state !== state) { res.setHeader('Content-Type', 'text/html'); return res.status(400).send(page('Erro', 'Link de conexao invalido. Gere de novo pelo painel.')); }
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: q.code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' })
    });
    const j = await r.json();
    res.setHeader('Content-Type', 'text/html');
    if (!j.refresh_token) return res.status(400).send(page('Erro', 'O Google nao devolveu a autorizacao permanente. Tente conectar de novo. Detalhe: ' + (j.error_description || j.error || 'sem refresh_token')));
    await rpc('sp_cfg_set', { p_chave: 'drive_refresh_token', p_valor: j.refresh_token });
    // envia tudo que estava aguardando
    const rows = await rpc('sp_envios_listar', {});
    let n = 0; for (const row of rows.filter(x => x.drive_status !== 'ok')) { const s = await syncEnvio(row.id); if (s.ok) n++; }
    return res.status(200).send(page('Drive conectado', `Google Drive conectado com sucesso. ${n} envio(s) pendente(s) foram enviados para a pasta.`));
  }
  if (q.senha === ADMIN_SENHA) {
    const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state });
    res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString() }); return res.end();
  }
  res.writeHead(302, { Location: '/' }); res.end();
};
