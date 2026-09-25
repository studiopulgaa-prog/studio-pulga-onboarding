const { syncEnvio } = require('../lib/drive');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const id = req.body && req.body.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, erro: 'id invalido' });
  const r = await syncEnvio(id);
  res.status(200).json(r);
};
