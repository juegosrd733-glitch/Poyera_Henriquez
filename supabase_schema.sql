-- Script SQL para inicializar la base de datos en Supabase para Pollera Henríquez RD

-- Habilitar extensión para UUIDs (identificadores únicos)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Productos
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT, -- Pollo entero, Pechuga, etc.
    cost NUMERIC(15, 2) DEFAULT 0, -- Precio de compra
    price NUMERIC(15, 2) DEFAULT 0, -- Precio de venta
    stock NUMERIC(15, 4) DEFAULT 0,
    unit TEXT, -- libras, unidades
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Ventas
CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total NUMERIC(15, 2) NOT NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('efectivo', 'tarjeta', 'credito')),
    payment NUMERIC(15, 2) DEFAULT 0,
    cash NUMERIC(15, 2) DEFAULT 0,
    change NUMERIC(15, 2) DEFAULT 0,  -- Cambio devuelto
    credit_client_name TEXT,          -- Nombre del cliente si es crédito
    profit NUMERIC(15, 2) DEFAULT 0,  -- Ganancia calculada (venta - costo)
    sale_date TIMESTAMPTZ DEFAULT now()
);

-- 2.1 Detalle de Ventas (Para múltiples productos por venta)
CREATE TABLE public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    qty NUMERIC(15, 4) NOT NULL,
    price NUMERIC(15, 2) NOT NULL,
    profit NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Compras
CREATE TABLE public.purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    qty NUMERIC(15, 4) NOT NULL,
    price NUMERIC(15, 2) NOT NULL,
    total NUMERIC(15, 2) NOT NULL,
    provider TEXT,
    purchase_date TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de Cuentas por Cobrar (Ventas a Crédito)
CREATE TABLE public.accounts_receivable (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    balance NUMERIC(15, 2) NOT NULL, -- Saldo pendiente
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabla de Perfiles (Extiende los usuarios de Supabase Auth)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    permissions TEXT[], -- Ejemplo: ['dashboard', 'ventas', 'inventario']
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabla de Movimientos de Caja (Fondos, gastos varios, etc.)
CREATE TABLE public.cash_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('ingreso', 'egreso')),
    description TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE
);

-- Habilitar RLS (Seguridad a Nivel de Fila)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

-- Políticas básicas de acceso para usuarios autenticados
DROP POLICY IF EXISTS "Acceso total a productos para autenticados" ON public.products;
CREATE POLICY "Acceso total a productos para autenticados" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a ventas para autenticados" ON public.sales;
CREATE POLICY "Acceso total a ventas para autenticados" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a detalles de venta para autenticados" ON public.sale_items;
CREATE POLICY "Acceso total a detalles de venta para autenticados" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a compras para autenticados" ON public.purchases;
CREATE POLICY "Acceso total a compras para autenticados" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a cuentas por cobrar para autenticados" ON public.accounts_receivable;
CREATE POLICY "Acceso total a cuentas por cobrar para autenticados" ON public.accounts_receivable FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a movimientos de caja para autenticados" ON public.cash_movements;
CREATE POLICY "Acceso total a movimientos de caja para autenticados" ON public.cash_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios gestionan su propio perfil" ON public.profiles;
CREATE POLICY "Usuarios gestionan su propio perfil" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);