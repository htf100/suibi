import { createClient } from 'npm:@supabase/supabase-js@2.117.0';

const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const appUrl = Deno.env.get('APP_URL') ?? '';
const allowedOrigin = appUrl ? new URL(appUrl).origin : '';
const admin = projectUrl && secretKey ? createClient(projectUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
}) : null;

function reply(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async request => {
  if (!admin || !appUrl) return reply({ error: '后台尚未配置完成' }, 503);
  if (request.headers.get('origin') !== allowedOrigin) return reply({ error: '来源不允许' }, 403);
  if (request.method === 'OPTIONS') return reply({}, 204);
  if (request.method !== 'POST') return reply({ error: '请求方式不支持' }, 405);

  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply({ error: '请先登录' }, 401);
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity.user) return reply({ error: '登录已失效' }, 401);
  const { data: member, error: memberError } = await admin.from('members')
    .select('role, active').eq('user_id', identity.user.id).single();
  if (memberError || member?.role !== 'owner' || !member.active) return reply({ error: '没有账号管理权限' }, 403);

  let input: Record<string, unknown>;
  try { input = await request.json(); }
  catch { return reply({ error: '请求内容无效' }, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: '请求内容无效' }, 400);

  if (input.action === 'list') {
    const { data, error } = await admin.from('members')
      .select('user_id, email, display_name, role, active, invited_at').order('invited_at', { ascending: false });
    return error ? reply({ error: '读取成员列表失败' }, 500) : reply({ members: data });
  }

  if (input.action === 'invite') {
    const email = String(input.email ?? '').trim().toLowerCase();
    const displayName = String(input.display_name ?? '').trim().slice(0, 60);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: '请输入有效邮箱' }, 400);
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: appUrl,
    });
    if (inviteError || !invitation.user) return reply({ error: inviteError?.message ?? '邀请失败' }, 400);
    const { error } = await admin.from('members').upsert({
      user_id: invitation.user.id, email, display_name: displayName || email.split('@')[0],
      role: 'writer', active: true,
    }, { onConflict: 'user_id' });
    if (error) return reply({ error: '邀请邮件已发送，但创建成员记录失败；请联系站点管理员处理。' }, 500);
    return reply({ message: `邀请已发送到 ${email}` });
  }

  if (input.action === 'set_active') {
    const userId = String(input.user_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(userId) || typeof input.active !== 'boolean') return reply({ error: '成员参数无效' }, 400);
    const { data: target, error: targetError } = await admin.from('members')
      .select('role').eq('user_id', userId).single();
    if (targetError || !target) return reply({ error: '成员不存在' }, 404);
    if (target.role === 'owner') return reply({ error: '不能停用管理员账号' }, 403);
    const { error } = await admin.from('members').update({ active: input.active }).eq('user_id', userId);
    return error ? reply({ error: '更新成员失败' }, 500) : reply({ message: input.active ? '账号已启用' : '账号已停用' });
  }

  return reply({ error: '不支持的操作' }, 400);
});
