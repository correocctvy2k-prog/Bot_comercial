const { createClient } = require('@supabase/supabase-js');

// Usamos las credenciales del entorno (El Worker debe tener la SERVICE_ROLE_KEY idealmente, 
// o la tabla debe permitir inserts públicos para 'pending')
const supabaseURL = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseURL, supabaseKey);

/**
 * Verifica el rol del usuario.
 * Si no existe, lo crea automáticamente como 'pending'.
 */
async function checkUserRole(waId, name) {
  try {
    const { data, error } = await supabase
      .from('access_control')
      .select('role, name')
      .eq('wa_id', waId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 es "Row not found"
      console.error("❌ Error verificando rol:", error.message);
      return 'pending'; // Fallback seguro
    }

    if (data) {
      // Si tiene nombre desactualizado, podríamos actualizarlo "silenciosamente"
      if (name && data.name !== name) {
        // Fire and forget update
        supabase.from('access_control').update({ name }).eq('wa_id', waId).then();
      }
      return data.role;
    } else {
      // ✨ AUTO-REGISTRO: Usuario nuevo -> 'pending'
      console.log(`👤 Nuevo usuario detectado: ${name} (${waId}). Registrando como pending...`);
      await supabase.from('access_control').insert({
        wa_id: waId,
        name: name || "Desconocido",
        role: 'pending'
      });
      return 'pending';
    }
  } catch (e) {
    console.error("❌ Exception en checkUserRole:", e);
    return 'pending';
  }
}

/**
 * Obtiene lista de usuarios pendientes para que el Admin apruebe.
 */
async function getPendingUsers() {
  const { data, error } = await supabase
    .from('access_control')
    .select('*')
    .eq('role', 'pending')
    .order('created_at', { ascending: false });

  return data || [];
}

/**
 * Obtiene TODOS los usuarios.
 */
async function getAllUsers() {
  const { data, error } = await supabase
    .from('access_control')
    .select('*')
    .order('role', { ascending: false }) // pending/SUPERADMIN arriba
    .order('created_at', { ascending: false });

  return data || [];
}

/**
 * Aprueba o bloquea un usuario.
 */
async function setUserRole(waId, role) {
  const { error } = await supabase
    .from('access_control')
    .update({ role })
    .eq('wa_id', waId);

  return !error;
}

// Wrapper de compatibilidad para bot.service.js
async function getUserAccess(waId) {
  const role = await checkUserRole(waId);
  return { role };
}

function canAccessZone(access, zone) {
  // Por ahora, SUPERADMIN y ADMIN ven todo.
  // VIEWER también ve todo (mientras implementamos asignación por zona específica).
  const role = access?.role || "NONE";
  if (role === "SUPERADMIN" || role === "ADMIN" || role === "VIEWER") return true;
  return false;
}



/**
 * Obtiene estadísticas básicas del sistema (Usuarios, Cola).
 */
async function getSystemStats() {
  try {
    const { count: usersCount, error: errUsers } = await supabase.from('access_control').select('*', { count: 'exact', head: true });
    if (errUsers) console.error("❌ Stats Error (Users):", errUsers.message);

    const { count: pendingUsers, error: errPending } = await supabase.from('access_control').select('*', { count: 'exact', head: true }).eq('role', 'pending');
    if (errPending) console.error("❌ Stats Error (Pending):", errPending.message);

    // Nota: bot_queue puede no ser accesible si las Policies son estrictas
    const { count: queueCount, error: errQueue } = await supabase.from('bot_queue').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing']);
    if (errQueue) {
      console.error("❌ Stats Error (Queue):", errQueue.message);
      // Si falla cola (ej: 403), retornamos 0 para no romper todo
    }

    // CRM Contacts
    const { count: crmContacts, error: errCrm } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
    if (errCrm) console.error("❌ Stats Error (CRM):", errCrm.message);

    return {
      users: usersCount || 0,
      pending_users: pendingUsers || 0,
      queue: queueCount || 0,
      crm_contacts: crmContacts || 0
    };
  } catch (e) {
    console.error("❌ Exception in getSystemStats:", e);
    throw e; // Rethrow so bot.service.js catches it
  }
}


module.exports = {
  checkUserRole,
  getPendingUsers,
  getAllUsers,
  setUserRole,
  getUserAccess,
  canAccessZone,
  getSystemStats // ✅ Added
};
