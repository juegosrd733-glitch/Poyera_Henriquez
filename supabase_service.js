import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 🔑 CONFIGURACIÓN DE SUPABASE - Pollera Henríquez RD
const SUPABASE_URL = 'https://lxmjfjcsmguejxfwhylh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4bWpmamNzbWd1ZWp4ZndoeWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTA5MTcsImV4cCI6MjA5MzU2NjkxN30.PewEusshN-Vr_5zBfY1htVq2eDW5DjQr1wL-I1OVcZw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🔐 AUTENTICACIÓN
export async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return { user, profile: profile || null };
}

export async function signUp(username, password, email, role, permissions) {
  const { data: { user }, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (user) {
    const { error: profileError } = await supabase.from('profiles').insert([{
      id: user.id, username, role: role || 'user', permissions: Array.isArray(permissions) ? permissions : []
    }]);
    if (profileError) throw profileError;
  }
  return user;
}

export async function updatePassword(newPassword) {
  return await supabase.auth.updateUser({ password: newPassword });
}

// 📦 PRODUCTOS
export async function getProducts() {
  const { data, error } = await supabase.from('products').select('*').order('name');
  if (error) console.error('Error al obtener productos:', error);
  return data || [];
}

export async function upsertProduct(product) {
  const { data, error } = await supabase.from('products').upsert(product).select();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// 🧾 VENTAS
export async function getSales() {
  const { data, error } = await supabase.from('sales')
    .select('*, products(name, unit, price)').order('sale_date', { ascending: false });
  if (error) console.error('Error al obtener ventas:', error);
  return data || [];
}

export async function registerSale(saleData) {
  // Validar producto existe
  const { data: product, error: prodError } = await supabase.from('products')
    .select('cost, stock, price').eq('id', saleData.product_id).single();
  if (prodError || !product) throw new Error('Producto no encontrado');

  // Validar si hay stock suficiente
  if (Number(product.stock) < Number(saleData.qty)) {
    throw new Error(`Stock insuficiente. Disponible: ${product.stock}`);
  }

  // Calcular ganancia
  const profit = (saleData.price - product.cost) * saleData.qty;
  
  // Registrar venta
  const { data: sale, error: saleError } = await supabase.from('sales')
    .insert([{ ...saleData, profit }]).select();
  if (saleError) throw saleError;

  // Actualizar stock (evitar negativos)
  const newStock = Number(product.stock) - Number(saleData.qty);
  await supabase.from('products').update({ stock: newStock }).eq('id', saleData.product_id);

  // Si es crédito, crear cuenta por cobrar
  if (saleData.payment_type === 'credito' && sale?.length > 0) {
    await supabase.from('accounts_receivable').insert([{
      sale_id: sale[0].id,
      client_name: saleData.credit_client_name || 'Cliente Anónimo',
      amount: saleData.total,
      balance: saleData.total,
      status: 'pending'
    }]);
  }
  return sale;
}

export async function updateSale(id, updateData) {
  const { data, error } = await supabase.from('sales').update(updateData).eq('id', id).select();
  if (error) throw error;
  return data;
}

export async function deleteSale(id) {
  // 1. Obtener detalles de la venta para restaurar stock
  const { data: sale, error: saleError } = await supabase.from('sales')
    .select('product_id, qty').eq('id', id).single();
  if (saleError || !sale) throw new Error('Venta no encontrada');

  // 2. Obtener stock actual del producto
  const { data: product, error: prodError } = await supabase.from('products')
    .select('stock').eq('id', sale.product_id).single();
  if (prodError || !product) throw new Error('Producto no encontrado');

  // 3. Eliminar la venta (el esquema SQL borrará la cuenta por cobrar en cascada)
  const { error: delError } = await supabase.from('sales').delete().eq('id', id);
  if (delError) throw delError;

  // 4. Restaurar el stock al producto
  const { error: updateError } = await supabase.from('products')
    .update({ stock: Number(product.stock) + Number(sale.qty) })
    .eq('id', sale.product_id);
  if (updateError) throw updateError;
}

// 📥 COMPRAS
export async function getPurchases() {
  const { data, error } = await supabase.from('purchases')
    .select('*, products(name)').order('purchase_date', { ascending: false });
  if (error) console.error('Error al obtener compras:', error);
  return data || [];
}

export async function registerPurchase(purchaseData) {
  // Obtener stock actual
  const { data: product } = await supabase.from('products')
    .select('stock').eq('id', purchaseData.product_id).single();
  const currentStock = product?.stock || 0;

  // Registrar compra
  const { data: purchase, error } = await supabase.from('purchases')
    .insert([purchaseData]).select();
  if (error) throw error;

  // Actualizar stock del producto
  await supabase.from('products')
    .update({ stock: currentStock + purchaseData.qty })
    .eq('id', purchaseData.product_id);
  
  return purchase;
}

export async function updatePurchase(id, updateData) {
  const { data, error } = await supabase.from('purchases').update(updateData).eq('id', id).select();
  if (error) throw error;
  return data;
}

export async function deletePurchase(id) {
  // 1. Obtener detalles de la compra para descontar stock
  const { data: purchase, error: pError } = await supabase.from('purchases')
    .select('product_id, qty').eq('id', id).single();
  if (pError || !purchase) throw new Error('Compra no encontrada');

  // 2. Obtener stock actual del producto
  const { data: product, error: prodError } = await supabase.from('products')
    .select('stock').eq('id', purchase.product_id).single();
  if (prodError || !product) throw new Error('Producto no encontrado');

  // 3. Eliminar el registro de compra
  const { error: delError } = await supabase.from('purchases').delete().eq('id', id);
  if (delError) throw delError;

  // 4. Descontar el stock al producto (revertir la suma de la compra)
  const { error: updateError } = await supabase.from('products')
    .update({ stock: Number(product.stock) - Number(purchase.qty) })
    .eq('id', purchase.product_id);
  if (updateError) throw updateError;
}

// 💰 CUENTAS POR COBRAR
export async function getAccountsReceivable() {
  const { data, error } = await supabase.from('accounts_receivable')
    .select('*, sales(total)').order('created_at', { ascending: false });
  if (error) console.error('Error al obtener cuentas por cobrar:', error);
  return data || [];
}

export async function updateAccountReceivable(id, updateData) {
  const { data, error } = await supabase.from('accounts_receivable')
    .update(updateData).eq('id', id).select();
  if (error) throw error;
  return data;
}

export async function deleteAccountReceivable(id) {
  const { error } = await supabase.from('accounts_receivable').delete().eq('id', id);
  if (error) throw error;
}

// 👥 USUARIOS Y PERFILES
export async function getUsersWithProfiles() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) console.error('Error al obtener usuarios:', error);
  return data || [];
}

export async function updateUserProfile(id, profileData) {
  const { data, error } = await supabase.from('profiles').update(profileData).eq('id', id).select();
  if (error) throw error;
  return data;
}

export async function deleteUserProfile(id) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw error;
}

// ⚠️ MANTENIMIENTO (ELIMINACIÓN MASIVA)
export async function truncateTable(tableName) {
  const { error } = await supabase.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}