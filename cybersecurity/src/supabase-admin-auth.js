function bearerToken(request) {
  const value = String(request.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

function createSupabaseAdminAuthorizer({ url, key, fetchImpl = fetch }) {
  if (!url || !key) return async () => false;
  const base = String(url).replace(/\/$/, '');
  return async (request) => {
    const token = bearerToken(request);
    if (!token) return false;
    const userResponse = await fetchImpl(`${base}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!userResponse.ok) return false;
    const user = await userResponse.json();
    if (!user?.id) return false;
    const profileResponse = await fetchImpl(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=roles(name)`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!profileResponse.ok) return false;
    const profiles = await profileResponse.json();
    return profiles?.[0]?.roles?.name === 'superadmin' ? { id: user.id, role: 'superadmin' } : false;
  };
}

module.exports = { bearerToken, createSupabaseAdminAuthorizer };
