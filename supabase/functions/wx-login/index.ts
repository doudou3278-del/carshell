// Supabase Edge Function: wx-login
// Exchanges a one-time wx.login() code from the 头蚊字 Dou mini program for the user's openid,
// then returns that WeChat user's site token (same token on every device) and merges this
// device's previous activity + the mini-program-era cars/comments into the account.
//
// Secrets (Edge Functions → Secrets): WX_APPID, WX_SECRET. Keep "Verify JWT" ON; the site sends the public anon JWT (config.js FUNCTIONS_JWT).
import { createClient } from 'npm:@supabase/supabase-js@2';

const APPID = Deno.env.get('WX_APPID') ?? '';
const SECRET = Deno.env.get('WX_SECRET') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  if (!APPID || !SECRET) return reply({ error: '服务端还没配置微信 AppID / AppSecret' }, 500);

  let body: { code?: string; token?: string };
  try { body = await req.json(); } catch { return reply({ error: '请求格式错误' }, 400); }
  const code = String(body.code ?? '').trim();
  const oldToken = String(body.token ?? '');
  if (!/^[A-Za-z0-9_\-]{10,128}$/.test(code)) return reply({ error: '登录码格式不对，请在小程序里重新复制' }, 400);

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(APPID)}&secret=${encodeURIComponent(SECRET)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  let wx: { openid?: string; errcode?: number; errmsg?: string };
  try { wx = await (await fetch(url)).json(); } catch { return reply({ error: '连接微信服务器失败，请稍后再试' }, 502); }
  if (!wx.openid) {
    const expired = wx.errcode === 40029 || wx.errcode === 40163;
    console.warn('code2session failed', wx.errcode, wx.errmsg);
    return reply({ error: expired ? '登录码已失效（5 分钟内有效、只能用一次），请在小程序里重新获取' : '微信登录失败：' + (wx.errmsg ?? wx.errcode) }, 400);
  }

  // Find or create this WeChat user's account token.
  await db.from('cs_wx_accounts').upsert({ openid: wx.openid, token: randomToken() }, { onConflict: 'openid', ignoreDuplicates: true });
  const { data: acc, error: accErr } = await db.from('cs_wx_accounts').select('token').eq('openid', wx.openid).single();
  if (accErr || !acc) return reply({ error: '账号读取失败' }, 500);
  await db.from('cs_wx_accounts').update({ last_login: new Date().toISOString() }).eq('openid', wx.openid);

  const { data: profile, error } = await db.rpc('cs_wx_merge', { p_openid: wx.openid, p_old_token: oldToken, p_new_token: acc.token });
  if (error) { console.error(error); return reply({ error: '账号合并失败' }, 500); }

  return reply({ token: acc.token, profile });
});
