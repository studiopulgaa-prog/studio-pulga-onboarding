const { rpc, syncEnvio, accessToken, SUPA, ADMIN_SENHA } = require('../lib/drive');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = req.body || {};
  if (b.senha !== ADMIN_SENHA) return res.status(401).json({ ok: false, erro: 'senha' });
  try {
    if (b.acao === 'listar') {
      const rows = await rpc('sp_envios_listar', {});
      const rt = await rpc('sp_cfg_get', { p_chave: 'drive_refresh_token' });
      return res.json({ ok: true, driveConectado: !!rt, envios: rows.map(r => ({
        id: r.id, criado_em: r.criado_em, empresa: r.empresa, nicho: r.nicho, doc_html: r.doc_html,
        drive_status: r.drive_status, drive_erro: r.drive_erro, drive_folder_id: r.drive_folder_id,
        imagens: (r.imagens || []).map(i => ({ nome: i.nome, url: `${SUPA}/storage/v1/object/public/onboarding/${i.path}` }))
      })) });
    }
    if (b.acao === 'sync') {
      const rows = await rpc('sp_envios_listar', {});
      const alvo = b.id ? rows.filter(r => r.id === b.id) : rows.filter(r => r.drive_status !== 'ok');
      const out = [];
      for (const r of alvo) out.push(Object.assign({ id: r.id, empresa: r.empresa }, await syncEnvio(r.id)));
      return res.json({ ok: true, resultados: out });
    }
    if (b.acao === 'diagnostico') {
      const token = await accessToken();
      const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + token } });
      const userinfo = await ui.json();
      const raiz = await rpc('sp_cfg_get', { p_chave: 'drive_folder_raiz' });
      let raizInfo = null;
      if (raiz) {
        const rr = await fetch(`https://www.googleapis.com/drive/v3/files/${raiz}?fields=id,name,webViewLink,trashed`, { headers: { Authorization: 'Bearer ' + token } });
        raizInfo = await rr.json();
      }
      return res.json({ ok: true, contaConectada: userinfo.email, pastaRaizId: raiz, pastaRaizInfo: raizInfo });
    }
    res.status(400).json({ ok: false, erro: 'acao' });
  } catch (e) { res.status(500).json({ ok: false, erro: String(e.message || e) }); }
};
