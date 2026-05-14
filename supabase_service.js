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
    .select('*, sale_items(*, products(name))').order('sale_date', { ascending: false });
  if (error) console.error('Error al obtener ventas:', error);
  return data || [];
}

export async function registerSale(saleData) {
  const { items, ...header } = saleData;
  let totalProfit = 0;

  // 1. Registrar el encabezado de la venta
  const { data: sale, error: saleError } = await supabase.from('sales')
    .insert([header]).select();
  if (saleError) throw saleError;
  const saleId = sale[0].id;

  // 2. Procesar cada producto
  for (const item of items) {
    const { data: product } = await supabase.from('products')
      .select('cost, stock').eq('id', item.product_id).single();
    
    if (!product || Number(product.stock) < Number(item.qty)) {
      throw new Error(`Stock insuficiente para uno de los productos.`);
    }

    const itemProfit = (item.price - product.cost) * item.qty;
    totalProfit += itemProfit;

    // Registrar item
    const { error: itemError } = await supabase.from('sale_items').insert([{
      sale_id: saleId,
      product_id: item.product_id,
      qty: item.qty,
      price: item.price,
      profit: itemProfit
    }]);
    if (itemError) throw itemError;

    // Actualizar stock
    const { error: stockError } = await supabase.from('products')
      .update({ stock: Number(product.stock) - Number(item.qty) })
      .eq('id', item.product_id);
    if (stockError) throw stockError;
  }

  // 3. Actualizar la ganancia total en el encabezado
  const { error: profitError } = await supabase.from('sales')
    .update({ profit: totalProfit })
    .eq('id', saleId);
  if (profitError) throw profitError;

  // Si es crédito, crear cuenta por cobrar
  if (header.payment_type === 'credito') {
    await supabase.from('accounts_receivable').insert([{
      sale_id: saleId,
      client_name: header.credit_client_name || 'Cliente Anónimo',
      amount: header.total,
      balance: header.total,
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
  // 1. Obtener los items para devolver el stock
  const { data: items } = await supabase.from('sale_items')
    .select('product_id, qty').eq('sale_id', id);

  if (items) {
    for (const item of items) {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
      if (prod) {
        await supabase.from('products')
          .update({ stock: Number(prod.stock) + Number(item.qty) })
          .eq('id', item.product_id);
      }
    }
  }

  // 2. Eliminar la venta (borrado en cascada afectará items y cuentas por cobrar)
  const { error: delError } = await supabase.from('sales').delete().eq('id', id);
  if (delError) throw delError;
}

// 📥 COMPRAS
export async function getPurchases() {
  const { data, error } = await supabase.from('purchases')
    .select('*, products(name)').order('purchase_date', { ascending: false });
  if (error) console.error('Error al obtener compras:', error);
  return data || [];
}

export async function registerPurchase(purchaseData, deductFromCash = true) {
  // Obtener stock, nombre y unidad para la descripción del movimiento
  const { data: product } = await supabase.from('products')
    .select('name, stock, unit').eq('id', purchaseData.product_id).single();
  const currentStock = product?.stock || 0;

  // Si se marcó pagar con caja, validar saldo suficiente antes de proceder
  if (deductFromCash) {
    const balance = await getCashBalance();

    if (Number(balance) < Number(purchaseData.total)) {
      throw new Error(`Saldo insuficiente en fondo de caja. Disponible: RD$ ${balance.toFixed(2)}`);
    }
  }

  // Registrar compra
  const { data: purchase, error } = await supabase.from('purchases')
    .insert([purchaseData]).select();
  if (error) throw error;

  // Si se marcó pagar con caja, registrar el egreso
  if (deductFromCash && purchase && purchase.length > 0) {
    const { error: moveError } = await supabase.from('cash_movements').insert([{
      type: 'egreso',
      description: `Pago compra: ${product?.name || 'Producto'} (${purchaseData.qty} ${product?.unit || ''})`,
      amount: Number(purchaseData.total),
      purchase_id: purchase[0].id
    }]);

    if (moveError) throw new Error('Compra registrada, pero error al descontar de caja: ' + moveError.message);
  }

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

// 💰 MOVIMIENTOS DE CAJA (FONDO INICIAL / GASTOS)
export async function getCashMovements() {
  const { data, error } = await supabase.from('cash_movements')
    .select('*').order('created_at', { ascending: false });
  if (error) console.error('Error al obtener movimientos de caja:', error);
  return data || [];
}

export async function getCashBalance() {
  const movements = await getCashMovements();
  return movements.reduce((acc, m) => 
    m.type === 'ingreso' ? acc + Number(m.amount) : acc - Number(m.amount), 0
  );
}

export async function registerCashMovement(movementData) {
  const { data, error } = await supabase.from('cash_movements').insert([movementData]).select();
  if (error) throw error;
  return data;
}

export async function deleteCashMovement(id) {
  const { error } = await supabase.from('cash_movements').delete().eq('id', id);
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